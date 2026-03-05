import { Octokit } from 'octokit';

export const OWNER = 'Jordybeer';
export const REPO = 'fx';
export const SOUNDS_PATH = 'public/sounds.json';

type GitHubContentFile = {
  sha?: string;
  content?: string;
};

export async function getContentSha(octokit: Octokit, path: string): Promise<string | null> {
  try {
    const res = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
      owner: OWNER,
      repo: REPO,
      path,
    });

    return (res.data as GitHubContentFile).sha ?? null;
  } catch (error: any) {
    if (error?.status === 404) return null;
    throw error;
  }
}

export async function getJsonFile<T>(octokit: Octokit, path: string): Promise<T | null> {
  try {
    const res = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
      owner: OWNER,
      repo: REPO,
      path,
    });

    const content = (res.data as GitHubContentFile).content;
    if (!content) return null;

    return JSON.parse(Buffer.from(content, 'base64').toString('utf8')) as T;
  } catch (error: any) {
    if (error?.status === 404) return null;
    throw error;
  }
}

export async function putFile(octokit: Octokit, path: string, contentBase64: string, message: string) {
  const sha = await getContentSha(octokit, path);

  await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
    owner: OWNER,
    repo: REPO,
    path,
    message,
    content: contentBase64,
    sha: sha ?? undefined,
  });
}

export async function deleteFile(octokit: Octokit, path: string, message: string) {
  const sha = await getContentSha(octokit, path);
  if (!sha) return;

  await octokit.request('DELETE /repos/{owner}/{repo}/contents/{path}', {
    owner: OWNER,
    repo: REPO,
    path,
    message,
    sha,
  });
}
