import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { Octokit } from "octokit";
import { authOptions } from "@/lib/auth";

const OWNER = "Jordybeer";
const REPO = "fx";

function safeFilename(name: string) {
  let cleaned = name.replace(/[^a-zA-Z0-9.\s_-]/g, "");
  cleaned = cleaned.replace(/\s+/g, "_");
  if (!cleaned.toLowerCase().endsWith(".mp3")) throw new Error(`File ${name} is not an MP3`);
  return cleaned;
}

function safeFolderName(name: string) {
  if (!name) return "";
  let cleaned = name.replace(/[^a-zA-Z0-9.\s_-]/g, "");
  cleaned = cleaned.replace(/\s+/g, "_");
  return cleaned;
}

async function getContentSha(octokit: Octokit, path: string) {
  try {
    const res = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", {
      owner: OWNER,
      repo: REPO,
      path
    });
    return (res.data as any).sha as string;
  } catch (e: any) {
    if (e?.status === 404) return null;
    throw e;
  }
}

async function putFile(octokit: Octokit, path: string, contentBase64: string, message: string) {
  const sha = await getContentSha(octokit, path);
  await octokit.request("PUT /repos/{owner}/{repo}/contents/{path}", {
    owner: OWNER,
    repo: REPO,
    path,
    message,
    content: contentBase64,
    sha: sha ?? undefined
  });
}

async function deleteFile(octokit: Octokit, path: string, message: string) {
  const sha = await getContentSha(octokit, path);
  if (!sha) return;
  await octokit.request("DELETE /repos/{owner}/{repo}/contents/{path}", {
    owner: OWNER,
    repo: REPO,
    path,
    message,
    sha
  });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const login = (session?.user as any)?.login?.toLowerCase();

  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (login !== "jordybeer") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const accessToken = (session as any).accessToken as string | undefined;
  if (!accessToken) return NextResponse.json({ error: "Missing access token" }, { status: 500 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch (e) {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const files = form.getAll("file");
  const game = String(form.get("game") ?? "");
  const rawSubfolder = String(form.get("subfolder") ?? "").trim();
  const subfolder = safeFolderName(rawSubfolder);

  if (!files || files.length === 0) return NextResponse.json({ error: "Missing files" }, { status: 400 });
  if (!game) return NextResponse.json({ error: "Missing game category" }, { status: 400 });

  const octokit = new Octokit({ auth: accessToken });
  const soundsPath = "public/sounds.json";
  let sounds: any[] = [];
  
  try {
    const res = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", { owner: OWNER, repo: REPO, path: soundsPath });
    sounds = JSON.parse(Buffer.from((res.data as any).content, "base64").toString("utf8"));
  } catch (e: any) {}
  if (!Array.isArray(sounds)) sounds = [];

  let addedCount = 0;
  let skippedCount = 0;

  for (const formFile of files) {
    if (!(formFile instanceof File) || formFile.size === 0) continue;
    try {
      const rawName = formFile.name;
      const filename = safeFilename(rawName);
      
      // Auto formatting name
      let displayName = rawName.replace(/\.mp3$/i, "").replace(/[_-]/g, " ");
      displayName = displayName.charAt(0).toUpperCase() + displayName.slice(1);
      
      // Check for exact duplicate name across the whole database
      if (sounds.some(s => s.name.toLowerCase() === displayName.toLowerCase())) {
          skippedCount++;
          continue; // Skip uploading this duplicate
      }

      const bytes = Buffer.from(await formFile.arrayBuffer());
      const contentBase64 = bytes.toString("base64");
      const path = subfolder ? `public/audio/${subfolder}/${filename}` : `public/audio/${filename}`;

      await putFile(octokit, path, contentBase64, `Upload: ${filename}`);

      const id = filename.replace(/\.mp3$/i, "") + (subfolder ? `_${subfolder}` : "");
      const src = subfolder ? `/audio/${subfolder}/${filename}` : `/audio/${filename}`;

      // A simple heuristic for server-side: We rely on the frontend to tell us if it's music/loopable via form data
      // For batch, we'll default to sfx, but frontend can pass 'type' if length > 10s.
      // Since FormData doesn't easily contain duration, frontend will pass a JSON map of types.
      const typesStr = form.get("typesMap");
      let type = "sfx";
      if (typesStr) {
          try {
              const typesMap = JSON.parse(String(typesStr));
              if (typesMap[rawName] === 'music') type = "music";
          } catch(e) {}
      }

      const next = { id, name: displayName, game, subfolder: subfolder || undefined, type, src };
      
      const existsIndex = sounds.findIndex((s: any) => s.src === src);
      if (existsIndex === -1) {
        sounds.push(next);
        addedCount++;
      } else {
        sounds[existsIndex] = next;
      }
    } catch (e) {}
  }

  try {
    const jsonBase64 = Buffer.from(JSON.stringify(sounds, null, 2), "utf8").toString("base64");
    await putFile(octokit, soundsPath, jsonBase64, `Batch update sounds.json (+${addedCount} sounds)`);
  } catch (e) {
    return NextResponse.json({ error: "Failed to update database" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, added: addedCount, skipped: skippedCount });
}

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.login?.toLowerCase() !== "jordybeer") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  
  const accessToken = (session as any).accessToken as string;
  const { id, newName } = await req.json();
  if (!id || !newName) return NextResponse.json({ error: "Missing data" }, { status: 400 });

  const octokit = new Octokit({ auth: accessToken });
  const soundsPath = "public/sounds.json";
  
  try {
    const res = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", { owner: OWNER, repo: REPO, path: soundsPath });
    const sounds = JSON.parse(Buffer.from((res.data as any).content, "base64").toString("utf8"));
    
    // Dupe check on rename
    if (sounds.some((s:any) => s.name.toLowerCase() === newName.toLowerCase() && s.id !== id)) {
        return NextResponse.json({ error: "A sound with this name already exists." }, { status: 400 });
    }

    const index = sounds.findIndex((s: any) => s.id === id);
    if (index === -1) return NextResponse.json({ error: "Sound not found" }, { status: 404 });
    
    sounds[index].name = newName;
    
    const jsonBase64 = Buffer.from(JSON.stringify(sounds, null, 2), "utf8").toString("base64");
    await putFile(octokit, soundsPath, jsonBase64, `Rename sound ${id} to ${newName}`);
    
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.login?.toLowerCase() !== "jordybeer") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  
  const accessToken = (session as any).accessToken as string;
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const octokit = new Octokit({ auth: accessToken });
  const soundsPath = "public/sounds.json";
  
  try {
    const res = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", { owner: OWNER, repo: REPO, path: soundsPath });
    let sounds = JSON.parse(Buffer.from((res.data as any).content, "base64").toString("utf8"));
    
    const soundToDelete = sounds.find((s: any) => s.id === id);
    if (!soundToDelete) return NextResponse.json({ error: "Sound not found" }, { status: 404 });
    
    const filePath = soundToDelete.src.startsWith('/') ? soundToDelete.src.substring(1) : soundToDelete.src;
    try {
        await deleteFile(octokit, filePath, `Delete sound file: ${filePath}`);
    } catch (e) {}

    sounds = sounds.filter((s: any) => s.id !== id);
    const jsonBase64 = Buffer.from(JSON.stringify(sounds, null, 2), "utf8").toString("base64");
    await putFile(octokit, soundsPath, jsonBase64, `Remove sound ${id} from database`);
    
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}