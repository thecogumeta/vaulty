import fs from "fs";
import os from "os";
import path from "path";
import semver from "semver";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const repos = new Map<string, string>();
const resolvingRefs = new Map<string, Promise<string>>();

const baseTempDir = path.join(os.tmpdir(), ".vaulty-git");
fs.mkdirSync(baseTempDir, { recursive: true });

function safeName(str: string) {
  return str.replace(/[\/:#*]/g, "_");
}

async function git(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args);
  return stdout;
}

export async function generateGitRepo(
  provider: string,
  repo: string,
  ref: string = "main",
): Promise<string> {
  const key = `${provider}/${repo}#${ref}`;

  if (repos.has(key)) {
    return repos.get(key)!;
  }

  const tempDir = fs.mkdtempSync(
    path.join(baseTempDir, safeName(`${repo}-${ref}-`)),
  );

  await git([
    "clone",
    "--depth",
    "1",
    "--branch",
    ref,
    `https://${provider}/${repo}.git`,
    tempDir,
  ]);

  repos.set(key, tempDir);

  return tempDir;
}

export async function ensureGitRepo(
  provider: string,
  repo: string,
  ref: string = "main",
): Promise<string> {
  const key = `${provider}/${repo}#${ref}`;

  if (repos.has(key)) {
    return repos.get(key)!;
  }

  return generateGitRepo(provider, repo, ref);
}

export async function resolveRef(
  provider: string,
  repo: string,
  ref: string,
): Promise<string> {
  const key = `${provider}/${repo}#${ref}`;

  const existing = resolvingRefs.get(key);
  if (existing) return existing;

  const promise = resolveRefInternal(provider, repo, ref);

  resolvingRefs.set(key, promise);

  try {
    return await promise;
  } finally {
    resolvingRefs.delete(key);
  }
}

async function resolveRefInternal(
  provider: string,
  repo: string,
  ref: string,
): Promise<string> {
  // Uma única consulta para branches e tags.
  const output = await git([
    "ls-remote",
    "--heads",
    "--tags",
    `https://${provider}/${repo}.git`,
  ]);

  const branches: string[] = [];
  const tags: string[] = [];

  for (const line of output.split("\n")) {
    const name = line.split("\t")[1];
    if (!name) continue;

    if (name.startsWith("refs/heads/")) {
      branches.push(name.replace("refs/heads/", ""));
    } else if (name.startsWith("refs/tags/")) {
      const tag = name.replace("refs/tags/", "").replace(/\^\{\}$/, "");

      if (semver.valid(tag.replace(/^v/, "")) !== null) {
        tags.push(tag);
      }
    }
  }

  if (branches.includes(ref)) {
    return ref;
  }

  if (!ref.includes("^") && !ref.includes("*") && !ref.includes("~")) {
    const exact =
      tags.find((t) => t === ref) ??
      tags.find((t) => t.replace(/^v/, "") === ref.replace(/^v/, ""));

    if (!exact) {
      throw new Error(`Version "${ref}" not found for ${provider}/${repo}`);
    }

    return exact;
  }

  const resolved = semver.maxSatisfying(
    tags.map((t) => t.replace(/^v/, "")),
    ref.replace(/^v/, ""),
  );

  if (!resolved) {
    throw new Error(`No version found for ${provider}/${repo}@${ref}`);
  }

  return tags.find((t) => t.replace(/^v/, "") === resolved) ?? resolved;
}

export function endGitSession() {
  for (const repoPath of repos.values()) {
    fs.rmSync(repoPath, { recursive: true, force: true });
  }

  repos.clear();
  resolvingRefs.clear();
}
