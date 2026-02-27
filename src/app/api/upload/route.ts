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
  const type = "sfx";

  if (!files || files.length === 0) {
    return NextResponse.json({ error: "Missing files" }, { status: 400 });
  }
  if (!game) {
    return NextResponse.json({ error: "Missing game category" }, { status: 400 });
  }

  const octokit = new Octokit({ auth: accessToken });

  // Read existing sounds.json first
  const soundsPath = "public/sounds.json";
  let sounds: any[] = [];
  try {
    const res = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", {
      owner: OWNER,
      repo: REPO,
      path: soundsPath
    });
    const current = Buffer.from((res.data as any).content, "base64").toString("utf8");
    sounds = JSON.parse(current);
  } catch (e: any) {
    if (e?.status !== 404) {
      console.error("Failed to read sounds.json:", e);
    }
  }

  if (!Array.isArray(sounds)) sounds = [];
  let addedCount = 0;

  // Process all files
  for (const formFile of files) {
    if (!(formFile instanceof File) || formFile.size === 0) continue;

    try {
      const rawName = formFile.name;
      const filename = safeFilename(rawName);
      const bytes = Buffer.from(await formFile.arrayBuffer());
      const contentBase64 = bytes.toString("base64");

      const path = subfolder ? `public/audio/${subfolder}/${filename}` : `public/audio/${filename}`;

      // Upload MP3
      await putFile(octokit, path, contentBase64, `Upload: ${filename}`);

      // Auto-generate a readable display name from the filename
      let displayName = rawName.replace(/\.mp3$/i, "").replace(/[_-]/g, " ");
      displayName = displayName.charAt(0).toUpperCase() + displayName.slice(1);

      const id = filename.replace(/\.mp3$/i, "") + (subfolder ? `_${subfolder}` : "");
      const src = subfolder ? `/audio/${subfolder}/${filename}` : `/audio/${filename}`;

      const next = {
        id,
        name: displayName,
        game,
        subfolder: subfolder || undefined,
        type,
        src
      };

      const existsIndex = sounds.findIndex((s: any) => s.src === src);
      if (existsIndex === -1) {
        sounds.push(next);
        addedCount++;
      } else {
        sounds[existsIndex] = next; // Update existing entry metadata
      }
    } catch (e: any) {
      console.error(`Failed to process ${formFile.name}:`, e);
      // We continue to the next file instead of crashing the whole batch
    }
  }

  // Update sounds.json once at the end
  try {
    const jsonBase64 = Buffer.from(JSON.stringify(sounds, null, 2), "utf8").toString("base64");
    await putFile(octokit, soundsPath, jsonBase64, `Batch update sounds.json (+${addedCount} sounds)`);
  } catch (e: any) {
    console.error("Failed to update sounds.json:", e);
    return NextResponse.json({ error: "MP3s uploaded, but failed to update JSON database" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, added: addedCount });
}