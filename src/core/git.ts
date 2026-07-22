import fs from "fs";
import os from "os";
import path from "path";
import semver from "semver";
import { run } from "./run";

const repos = new Map<string, string>();

const baseTempDir = path.join(os.tmpdir(), ".vaulty-git");
fs.mkdirSync(baseTempDir, { recursive: true });

function safeName(str: string) {
  return str.replace(/[\/:#*]/g, "_");
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

  run(
    `git clone --depth 1 --branch ${ref} https://${provider}/${repo}.git ${tempDir}`,
  );

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
  const headsOutput = run(
    `git ls-remote --heads https://${provider}/${repo}.git`,
  );
  const branches = headsOutput
    .split("\n")
    .map((line) => line.split("\t")[1]?.replace("refs/heads/", ""))
    .filter((b): b is string => !!b);

  if (branches.includes(ref)) {
    return ref;
  }

  const output = run(`git ls-remote --tags https://${provider}/${repo}.git`);
  const tags = output
    .split("\n")
    .map((line) =>
      line
        .split("\t")[1]
        ?.replace("refs/tags/", "")
        .replace(/\^\{\}$/, ""),
    )
    .filter(
      (t): t is string => !!t && semver.valid(t.replace(/^v/, "")) !== null,
    );

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
}
