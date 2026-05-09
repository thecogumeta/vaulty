import fs from "fs";
import path from "path";
import toml from "@iarna/toml";
import { handleDependencie } from "./vConfig";
import { ensureGitRepo, resolveRef } from "./git";
import { scopeToDir } from "./scopes";
import { log, vlog } from "./logging";

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
    const resolved = resolveRef(dep.provider, dep.repo, dep.ref);
    vlog(`  resolved ${dep.ref} -> ${resolved}`);
    return resolved;
  }

  if (!updateVersions && cached?.ref) {
    vlog(`  using locked version ${cached.ref}`);
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
  depth: number = 0,
): Promise<void> {
  for (const [depName, rawDep] of Object.entries(deps)) {
    const indent = "  ".repeat(depth);

    const depData: DepData = handleDependencie(rawDep as string);

    (parentEntry ? vlog : log)(
      `${indent}Resolving ${depName} [${scope}] (${depData.provider}:${depData.repo})`,
    );

    const originalRef = depData.ref;

    depData.ref = await resolveDepRef(
      depData,
      scope,
      updateVersions,
      lockCache,
    );

    if (depData.ref !== originalRef) {
      vlog(`${indent}  resolved ${originalRef} -> ${depData.ref}`);
    }

    const key =
      depData.provider === "local"
        ? `local:${path.resolve(cwd, depData.repo)}`
        : `${depData.provider}:${depData.repo}@${depData.ref}`;

    const folder = visited.get(key) ?? makeFolderName(depData, cwd);

    const redirect: Redirect = { name: depName, target: folder };

    if (isRoot) {
      content.root_redirects.push({ ...redirect, scope });
      vlog(`${indent}  added root redirect ${depName} -> ${folder}`);
    } else if (parentEntry) {
      parentEntry.redirects.push(redirect);
      vlog(`${indent}  added redirect ${depName} -> ${folder}`);
    }

    if (visited.has(key)) {
      vlog(`${indent}  reusing existing package ${folder}`);
      continue;
    }

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

    vlog(
      depData.provider === "local"
        ? `${indent}  resolved to local path ${repoPath}`
        : `${indent}  resolved to ${source}@${depData.ref}`,
    );

    vlog(`${indent}  found ${Object.keys(subDeps).length} dependencies`);

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

    vlog(`${indent}  added package entry ${folder}`);

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
      depth + 1,
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

  log(`${updateVersions ? "Updating" : "Generating"} vaulty.lock...`);

  const config = readToml(configPath);

  const lockPath = path.join(cwd, "vaulty.lock");

  const lockCache = buildLockCache(lockPath);

  vlog(`Loaded ${lockCache.size} cached package entries from vaulty.lock`);

  const content: LockContent = {
    root_redirects: [],
    package: [],
  };

  for (const [scope] of Object.entries(scopeToDir)) {
    const deps: Record<string, unknown> = config[scope] ?? {};

    vlog(`Resolving ${Object.keys(deps).length} packages from ${scope}`);

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

  vlog(`Generated ${content.package.length} package entries`);

  vlog(`Generated ${content.root_redirects.length} root redirects`);

  log(`${updateVersions ? "Updated" : "Generated"} vaulty.lock successfully`);
}
