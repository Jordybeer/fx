import { getServerSession } from 'next-auth/next';
import { NextResponse } from 'next/server';
import { Octokit } from 'octokit';
import { authOptions } from '@/lib/auth';
import { deleteFile, getJsonFile, putFile, SOUNDS_PATH } from '@/lib/github';

type SoundType = 'sfx' | 'music';

interface Sound {
  id: string;
  name: string;
  game: string;
  subfolder?: string;
  type: SoundType;
  src: string;
}

function safeFilename(name: string) {
  const cleaned = name
    .replace(/[^a-zA-Z0-9.\s_-]/g, '')
    .replace(/\s+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (!cleaned.toLowerCase().endsWith('.mp3')) {
    throw new Error(`File ${name} is not an MP3`);
  }

  return cleaned;
}

function safeFolderName(name: string) {
  if (!name) return '';

  return name
    .replace(/[^a-zA-Z0-9.\s_-]/g, '')
    .replace(/\s+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function toIdPart(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function makeDisplayName(rawName: string) {
  return rawName
    .replace(/\.mp3$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}

function makeSoundId(game: string, subfolder: string, filename: string) {
  const filenameBase = filename.replace(/\.mp3$/i, '');
  return [game, subfolder, filenameBase].filter(Boolean).map(toIdPart).join('__');
}

function parseTypesMap(input: FormDataEntryValue | null) {
  if (!input || typeof input !== 'string') return {} as Record<string, SoundType>;

  try {
    const parsed = JSON.parse(input) as Record<string, string>;
    return Object.fromEntries(
      Object.entries(parsed).filter(([, value]) => value === 'sfx' || value === 'music')
    ) as Record<string, SoundType>;
  } catch {
    return {} as Record<string, SoundType>;
  }
}

async function getAuthorizedSession() {
  const session = await getServerSession(authOptions);
  const login = session?.user?.login?.toLowerCase();

  if (!session) {
    return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };
  }

  if (login !== 'jordybeer') {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  if (!session.accessToken) {
    return { error: NextResponse.json({ error: 'Missing access token' }, { status: 500 }) };
  }

  return { session };
}

export async function POST(req: Request) {
  const auth = await getAuthorizedSession();
  if ('error' in auth) return auth.error;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const files = form.getAll('file');
  const game = String(form.get('game') ?? '').trim();
  const rawSubfolder = String(form.get('subfolder') ?? '').trim();
  const subfolder = safeFolderName(rawSubfolder);
  const typesMap = parseTypesMap(form.get('typesMap'));

  if (files.length === 0) {
    return NextResponse.json({ error: 'Missing files' }, { status: 400 });
  }

  if (!game) {
    return NextResponse.json({ error: 'Missing game category' }, { status: 400 });
  }

  const octokit = new Octokit({ auth: auth.session.accessToken });
  const existingSounds = (await getJsonFile<Sound[]>(octokit, SOUNDS_PATH)) ?? [];
  const sounds = Array.isArray(existingSounds) ? [...existingSounds] : [];
  const seenUploadKeys = new Set<string>();

  let addedCount = 0;
  let skippedCount = 0;

  for (const formFile of files) {
    if (!(formFile instanceof File) || formFile.size === 0) {
      skippedCount++;
      continue;
    }

    const uploadKey = `${formFile.name}:${formFile.size}:${formFile.lastModified}`;
    if (seenUploadKeys.has(uploadKey)) {
      skippedCount++;
      continue;
    }
    seenUploadKeys.add(uploadKey);

    try {
      const rawName = formFile.name;
      const filename = safeFilename(rawName);
      const displayName = makeDisplayName(rawName);

      if (sounds.some((sound) => sound.name.toLowerCase() === displayName.toLowerCase())) {
        skippedCount++;
        continue;
      }

      const bytes = Buffer.from(await formFile.arrayBuffer());
      const contentBase64 = bytes.toString('base64');
      const filePath = subfolder ? `public/audio/${subfolder}/${filename}` : `public/audio/${filename}`;
      const src = subfolder ? `/audio/${subfolder}/${filename}` : `/audio/${filename}`;
      const id = makeSoundId(game, subfolder, filename);
      const type = typesMap[rawName] === 'music' ? 'music' : 'sfx';

      await putFile(octokit, filePath, contentBase64, `Upload: ${filename}`);

      const nextSound: Sound = {
        id,
        name: displayName,
        game,
        subfolder: subfolder || undefined,
        type,
        src,
      };

      const existingIndex = sounds.findIndex((sound) => sound.src === src);
      if (existingIndex === -1) {
        sounds.push(nextSound);
        addedCount++;
      } else {
        sounds[existingIndex] = nextSound;
      }
    } catch (error) {
      console.error('Error processing upload', formFile.name, error);
      skippedCount++;
    }
  }

  try {
    const jsonBase64 = Buffer.from(JSON.stringify(sounds, null, 2), 'utf8').toString('base64');
    await putFile(octokit, SOUNDS_PATH, jsonBase64, `Batch update sounds.json (+${addedCount} sounds)`);
  } catch (error) {
    console.error('Failed to update sounds.json', error);
    return NextResponse.json({ error: 'Failed to update database' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, added: addedCount, skipped: skippedCount });
}

export async function PATCH(req: Request) {
  const auth = await getAuthorizedSession();
  if ('error' in auth) return auth.error;

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { id, newName } = (payload ?? {}) as { id?: unknown; newName?: unknown };
  if (typeof id !== 'string' || typeof newName !== 'string') {
    return NextResponse.json({ error: 'Invalid data type' }, { status: 400 });
  }

  const normalizedName = newName.trim().replace(/\s+/g, ' ');
  if (!normalizedName) {
    return NextResponse.json({ error: 'Missing data' }, { status: 400 });
  }

  const octokit = new Octokit({ auth: auth.session.accessToken });
  const sounds = (await getJsonFile<Sound[]>(octokit, SOUNDS_PATH)) ?? [];

  if (sounds.some((sound) => sound.name.toLowerCase() === normalizedName.toLowerCase() && sound.id !== id)) {
    return NextResponse.json({ error: 'A sound with this name already exists.' }, { status: 400 });
  }

  const index = sounds.findIndex((sound) => sound.id === id);
  if (index === -1) {
    return NextResponse.json({ error: 'Sound not found' }, { status: 404 });
  }

  sounds[index].name = normalizedName;

  try {
    const jsonBase64 = Buffer.from(JSON.stringify(sounds, null, 2), 'utf8').toString('base64');
    await putFile(octokit, SOUNDS_PATH, jsonBase64, `Rename sound ${id} to ${normalizedName}`);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Failed to rename sound', error);
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const auth = await getAuthorizedSession();
  if ('error' in auth) return auth.error;

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { id } = (payload ?? {}) as { id?: unknown };
  if (typeof id !== 'string') {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const octokit = new Octokit({ auth: auth.session.accessToken });
  const sounds = (await getJsonFile<Sound[]>(octokit, SOUNDS_PATH)) ?? [];
  const soundToDelete = sounds.find((sound) => sound.id === id);

  if (!soundToDelete) {
    return NextResponse.json({ error: 'Sound not found' }, { status: 404 });
  }

  const filePath = soundToDelete.src.startsWith('/')
    ? `public${soundToDelete.src}`
    : `public/${soundToDelete.src}`;

  try {
    await deleteFile(octokit, filePath, `Delete sound file: ${filePath}`);
  } catch (error) {
    console.error('Failed to delete audio file', filePath, error);
  }

  const nextSounds = sounds.filter((sound) => sound.id !== id);

  try {
    const jsonBase64 = Buffer.from(JSON.stringify(nextSounds, null, 2), 'utf8').toString('base64');
    await putFile(octokit, SOUNDS_PATH, jsonBase64, `Remove sound ${id} from database`);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Failed to remove sound from database', error);
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  }
}
