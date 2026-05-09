import fs from "fs";
import path from "path";
import toml from "@iarna/toml";
import { handleDependencie } from "./vConfig";
import { ensureGitRepo, resolveRef } from "./git";
import { scopeToDir } from "./scopes";

interface DepData {
  provider: string;
  repo: string;
  ref: string;
}

export interface Redirect {
  name: string;
  target: string;
}

export interface PackageEntry {
  name: string;
  source: string;
  scope: string;
  provider: string;
  ref: string;
  folder: string;
  redirects: Redirect[];
}

export interface RootRedirect {
  name: string;
  target: string;
  scope: string;
}

export interface LockContent {
  root_redirects: RootRedirect[];
  package: PackageEntry[];
}

function isFloatingRef(ref: string): boolean {
  return ref.includes("^") || ref.includes("*") || ref.includes("~");
}

function readToml(filePath: string): Record<string, any> {
  if (!fs.existsSync(filePath)) return {};
  const raw = fs.readFileSync(filePath, "utf-8");
  return toml.parse(raw) as Record<string, any>;
}

function buildLockCache(lockPath: string): Map<string, PackageEntry> {
  const existing = readToml(lockPath);
  const packages: PackageEntry[] = existing.package ?? [];
  return new Map(packages.map((p) => [`${p.scope}:${p.source}`, p]));
}

function makeFolderName(dep: DepData, cwd: string): string {
  if (dep.provider === "local") {
    const abs = path.resolve(cwd, dep.repo);
    const pkgName = path.basename(abs);
    return `local_${pkgName}@local`;
  }
  const repoSlug = dep.repo.replace(/\//g, "_");
  return `${dep.provider}_${repoSlug}@${dep.ref}`;
}

async function resolveDepRef(
  dep: DepData,
  scope: string,
  updateVersions: boolean,
  lockCache: Map<string, PackageEntry>,
): Promise<string> {
  if (dep.provider === "local") return "local";

  const source = `${dep.provider}:${dep.repo}`;
  const cached = lockCache.get(`${scope}:${source}`);
  const floating = isFloatingRef(dep.ref);

  if (!floating) {
    return resolveRef(dep.provider, dep.repo, dep.ref);
  }

  if (!updateVersions && cached?.ref) {
    return cached.ref;
  }

  return resolveRef(dep.provider, dep.repo, dep.ref);
}

async function resolvePackages(
  deps: Record<string, unknown>,
  cwd: string,
  rootCwd: string,
  updateVersions: boolean,
  content: LockContent,
  visited: Map<string, string>,
  lockCache: Map<string, PackageEntry>,
  isRoot: boolean,
  parentEntry?: PackageEntry,
  scope: string = "dependencies",
): Promise<void> {
  for (const [depName, rawDep] of Object.entries(deps)) {
    const depData: DepData = handleDependencie(rawDep as string);

    depData.ref = await resolveDepRef(
      depData,
      scope,
      updateVersions,
      lockCache,
    );

    const key =
      depData.provider === "local"
        ? `local:${path.resolve(cwd, depData.repo)}`
        : `${depData.provider}:${depData.repo}@${depData.ref}`;

    const folder = visited.get(key) ?? makeFolderName(depData, cwd);

    const redirect: Redirect = { name: depName, target: folder };
    if (isRoot) {
      content.root_redirects.push({ ...redirect, scope });
    } else if (parentEntry) {
      parentEntry.redirects.push(redirect);
    }

    if (visited.has(key)) continue;
    visited.set(key, folder);

    const repoPath =
      depData.provider === "local"
        ? path.resolve(cwd, depData.repo)
        : await ensureGitRepo(depData.provider, depData.repo, depData.ref);

    const depConfig = readToml(path.join(repoPath, "vaulty.toml"));
    const name: string = depConfig.package?.name ?? path.basename(repoPath);
    const subDeps: Record<string, unknown> = depConfig.dependencies ?? {};

    const source =
      depData.provider === "local"
        ? `file:${path.relative(rootCwd, repoPath).replace(/\\/g, "/")}`
        : `${depData.provider}:${depData.repo}`;

    const entry: PackageEntry = {
      name,
      source,
      scope,
      provider: depData.provider,
      ref: depData.ref,
      folder,
      redirects: [],
    };

    content.package.push(entry);

    await resolvePackages(
      subDeps,
      repoPath,
      rootCwd,
      updateVersions,
      content,
      visited,
      lockCache,
      false,
      entry,
      scope,
    );
  }
}

export async function generateVaultyLock(
  updateVersions: boolean = false,
): Promise<void> {
  const cwd = process.cwd();
  const configPath = path.join(cwd, "vaulty.toml");

  if (!fs.existsSync(configPath)) {
    throw new Error("vaulty.toml not found in the current directory.");
  }

  const config = readToml(configPath);
  const lockPath = path.join(cwd, "vaulty.lock");
  const lockCache = buildLockCache(lockPath);

  const content: LockContent = {
    root_redirects: [],
    package: [],
  };

  for (const [scope] of Object.entries(scopeToDir)) {
    const deps: Record<string, unknown> = config[scope] ?? {};
    await resolvePackages(
      deps,
      cwd,
      cwd,
      updateVersions,
      content,
      new Map(),
      lockCache,
      true,
      undefined,
      scope,
    );
  }

  fs.writeFileSync(lockPath, toml.stringify(content as any));
}
