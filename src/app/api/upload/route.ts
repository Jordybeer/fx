import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { Octokit } from "octokit";
import { authOptions } from "@/lib/auth";

const OWNER = "Jordybeer";
const REPO = "fx";

function safeFilename(name: string) {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]/g, "_");
  if (!cleaned.toLowerCase().endsWith(".mp3")) throw new Error("Only .mp3 allowed");
  return cleaned;
}

async function getContentSha(octokit: Octokit, path: string) {
  try {
    const res = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", {
      owner: OWNER,
      repo: REPO,
      path
    });
    // @ts-expect-error content endpoint returns sha
    return res.data.sha as string;
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
  const login = session?.user?.login?.toLowerCase();

  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (login !== "jordybeer") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const accessToken = (session as any).accessToken as string | undefined;
  if (!accessToken) return NextResponse.json({ error: "Missing access token" }, { status: 500 });

  const form = await req.formData();
  const file = form.get("file");
  const name = String(form.get("name") ?? "");
  const game = String(form.get("game") ?? "");
  const type = String(form.get("type") ?? "sfx");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }
  if (!name || !game) {
    return NextResponse.json({ error: "Missing name or game" }, { status: 400 });
  }

  const filename = safeFilename(file.name);
  const bytes = Buffer.from(await file.arrayBuffer());
  const contentBase64 = bytes.toString("base64");

  const octokit = new Octokit({ auth: accessToken });

  // 1) write MP3
  await putFile(
    octokit,
    `public/audio/${filename}`,
    contentBase64,
    `Upload sound: ${filename}`
  );

  // 2) update sounds.json
  const soundsPath = "public/sounds.json";
  let sounds: any[] = [];
  try {
    const res = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", {
      owner: OWNER,
      repo: REPO,
      path: soundsPath
    });
    // @ts-expect-error content endpoint returns base64 content
    const current = Buffer.from(res.data.content, "base64").toString("utf8");
    sounds = JSON.parse(current);
  } catch (e: any) {
    if (e?.status !== 404) throw e;
  }

  const id = filename.replace(/\.mp3$/i, "");
  const next = {
    id,
    name,
    game,
    type,
    src: `/audio/${filename}`
  };

  const exists = sounds.some((s: any) => s.id === id || s.src === next.src);
  if (!exists) sounds.push(next);

  const jsonBase64 = Buffer.from(JSON.stringify(sounds, null, 2), "utf8").toString("base64");
  await putFile(octokit, soundsPath, jsonBase64, `Update sounds.json (+${id})`);

  return NextResponse.json({ ok: true, added: !exists, sound: next });
}