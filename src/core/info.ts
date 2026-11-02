import fs from "fs";
import path from "path";
import toml from "@iarna/toml";
import { ensureGitRepo, resolveRef } from "./git";
import { scopeToDir, packageScopes } from "./scopes";
import { log, vlog } from "./logging";

interface PackageInfo {
  name?: string;
  version?: string;
  packageInfo?: {
    include: string[];
    exclude: string[];
  };
  dependencies: Record<string, string>;
  provider: string;
  repo: string;
  ref: string;
  source: string;
  defaultProject?: {
    name: string;
    $path?: string;
    $className?: string;
    tree?: Record<string, unknown>;
  };
  installed?: {
    scope: string;
    folder: string;
    path: string;
  } | null;
}

function parseInfoSpec(spec: string): {
  provider: string;
  repo: string;
  ref: string;
} {
  if (spec.startsWith("file:")) {
    const repo = spec.slice(5);
    if (!repo) {
      throw new Error(
        `Invalid local dependency "${spec}". Expected format: "file:../path/to/package".`,
      );
    }
    return { repo, provider: "local", ref: "local" };
  }

  let provider: string;
  let providerRest: string;

  if (spec.includes(":")) {
    [provider, providerRest] = spec.split(":");
  } else {
    provider = "github.com";
    providerRest = spec;
  }

  const atIndex = providerRest.lastIndexOf("@");

  let repo: string;
  let ref: string;

  if (atIndex === -1) {
    repo = providerRest;
    ref = "main";
  } else {
    repo = providerRest.slice(0, atIndex);
    ref = providerRest.slice(atIndex + 1);
  }

  if (!repo) {
    throw new Error(
      `Invalid package spec "${spec}". Expected format: "provider:repo@ref" or "repo@ref".`,
    );
  }

  return { repo, provider, ref };
}

async function readRepoConfig(repoPath: string): Promise<{
  config: any;
  configType: "vaulty" | "wally" | "none";
}> {
  const vaultyPath = path.join(repoPath, "vaulty.toml");
  const wallyPath = path.join(repoPath, "wally.toml");

  if (fs.existsSync(vaultyPath)) {
    return {
      config: toml.parse(fs.readFileSync(vaultyPath, "utf-8")),
      configType: "vaulty",
    };
  }

  if (fs.existsSync(wallyPath)) {
    return {
      config: toml.parse(fs.readFileSync(wallyPath, "utf-8")),
      configType: "wally",
    };
  }

  return { config: {}, configType: "none" };
}

async function findInstalledInfo(
  provider: string,
  repo: string,
  ref: string,
  cwd: string,
): Promise<{ scope: string; folder: string; path: string } | null> {
  const lockPath = path.join(cwd, "vaulty.lock");
  if (!fs.existsSync(lockPath)) return null;

  const lock = toml.parse(fs.readFileSync(lockPath, "utf-8")) as Record<
    string,
    unknown
  >;
  const packages = (lock.package as Array<Record<string, unknown>>) ?? [];

  const source =
    provider === "local"
      ? `file:${path.relative(cwd, ref === "local" ? repo : repo)}`
      : `${provider}:${repo}`;

  const entry = packages.find((p) => {
    const entrySource = p.source as string;
    const entryRef = p.ref as string;
    return entrySource === source || entryRef === ref;
  });

  if (!entry) return null;

  const scope = entry.scope as string;
  const folder = entry.folder as string;
  const scopeDir = scopeToDir[scope] ?? "Packages";

  return {
    scope,
    folder,
    path: path.join(cwd, scopeDir, "_Index", folder),
  };
}

function formatDependencies(deps: Record<string, string>): string {
  const keys = Object.keys(deps);
  if (keys.length === 0) return "  (none)";
  return keys.map((k) => `  - ${k}`).join("\n");
}

async function fetchPackageInfo(
  spec: string,
  cwd: string = process.cwd(),
): Promise<PackageInfo> {
  vlog(`Parsing spec: ${spec}`);

  const parsed = parseInfoSpec(spec);
  vlog(
    `Provider: ${parsed.provider}, Repo: ${parsed.repo}, Ref: ${parsed.ref}`,
  );

  const repoPath =
    parsed.provider === "local"
      ? path.resolve(cwd, parsed.repo)
      : await ensureGitRepo(parsed.provider, parsed.repo, parsed.ref);

  vlog(`Clone path: ${repoPath}`);

  let resolvedRef = parsed.ref;
  if (parsed.provider !== "local") {
    try {
      resolvedRef = await resolveRef(parsed.provider, parsed.repo, parsed.ref);
      vlog(`Resolved ref: ${resolvedRef}`);
    } catch (err) {
      vlog(`Could not resolve ref, using original: ${parsed.ref}`);
    }
  }

  const { config, configType } = await readRepoConfig(repoPath);
  vlog(`Config type: ${configType}`);

  const source =
    parsed.provider === "local"
      ? `file:${path.relative(cwd, repoPath)}`
      : `${parsed.provider}:${parsed.repo}`;

  const installed = await findInstalledInfo(
    parsed.provider,
    parsed.repo,
    resolvedRef,
    cwd,
  );

  return {
    name: config.package?.name,
    version: config.package?.version,
    packageInfo: config.package
      ? {
          include: config.package.include ?? [],
          exclude: config.package.exclude ?? [],
        }
      : undefined,
    dependencies: config.dependencies ?? {},
    provider: parsed.provider,
    repo: parsed.repo,
    ref: resolvedRef,
    source,
    defaultProject: fs.existsSync(path.join(repoPath, "default.project.json"))
      ? JSON.parse(
          fs.readFileSync(path.join(repoPath, "default.project.json"), "utf-8"),
        )
      : undefined,
    installed,
  };
}

function printPackageInfo(info: PackageInfo, showSource: boolean = true): void {
  log("");

  if (info.name) {
    log(`Name: ${info.name}${info.version ? ` (v${info.version})` : ""}`);
  }

  if (showSource) {
    log(`Source: ${info.source}`);
  }

  log(`Provider: ${info.provider}`);
  log(`Repo: ${info.repo}`);

  if (info.ref !== "local" && info.ref !== "main") {
    log(`Ref: ${info.ref}`);
  } else if (info.ref === "main") {
    log(`Ref: main (default branch)`);
  }

  if (info.installed) {
    log(`Installed: ${info.installed.scope} → ${info.installed.folder}`);
  } else {
    log("Installed: No");
  }

  if (info.packageInfo) {
    log("");
    log("Include patterns:");
    for (const pattern of info.packageInfo.include) {
      log(`  + ${pattern}`);
    }
    log("Exclude patterns:");
    for (const pattern of info.packageInfo.exclude) {
      log(`  - ${pattern}`);
    }
  }

  if (info.dependencies && Object.keys(info.dependencies).length > 0) {
    log("");
    log("Dependencies:");
    log(formatDependencies(info.dependencies));
  }

  if (info.defaultProject) {
    log("");
    log(`default.project.json:`);
    log(`  Name: ${info.defaultProject.name}`);
    if (info.defaultProject.$path) {
      log(`  $path: ${info.defaultProject.$path}`);
    }
  }

  log("");
}

async function fetchLocalPackages(cwd: string): Promise<
  Array<{
    name: string;
    status: "locked" | "not-locked" | "missing";
    info: PackageInfo;
  }>
> {
  const configPath = path.join(cwd, "vaulty.toml");
  if (!fs.existsSync(configPath)) return [];

  const config = toml.parse(fs.readFileSync(configPath, "utf-8")) as Record<
    string,
    unknown
  >;

  const results: Array<{
    name: string;
    status: "locked" | "not-locked" | "missing";
    info: PackageInfo;
  }> = [];

  for (const scope of packageScopes) {
    const deps = (config[scope] as Record<string, string>) ?? {};
    for (const [name, rawDep] of Object.entries(deps)) {
      const depStr = rawDep as string;

      try {
        const info = await fetchPackageInfo(depStr, cwd);

        let status: "locked" | "not-locked" | "missing";
        if (info.installed) {
          status = "locked";
        } else if (info.ref === "local") {
          status = fs.existsSync(path.resolve(cwd, info.repo))
            ? "locked"
            : "missing";
        } else {
          status = "not-locked";
        }

        results.push({ name, status, info });
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        vlog(`Error fetching ${name}: ${errorMsg}`);
        const parsed = parseInfoSpec(depStr);
        const missingInfo: PackageInfo = {
          dependencies: {},
          provider: parsed.provider,
          repo: parsed.repo,
          ref: parsed.ref,
          source: depStr,
        };
        results.push({ name, status: "missing", info: missingInfo });
      }
    }
  }

  return results;
}

function printLocalPackages(
  packages: Array<{
    name: string;
    status: "locked" | "not-locked" | "missing";
    info: PackageInfo;
  }>,
): void {
  if (packages.length === 0) {
    log("No packages found in vaulty.toml");
    return;
  }

  log("");

  const maxNameLen = Math.max(...packages.map((p) => p.name.length), 0);
  const statusSymbols: Record<string, string> = {
    locked: "✓",
    "not-locked": "○",
    missing: "✗",
  };

  for (const pkg of packages) {
    const name = pkg.name.padEnd(maxNameLen);
    const status = statusSymbols[pkg.status];
    log(`${name} ${status}`);
  }

  log("");
}

export async function vaultyInfo(pkgName?: string): Promise<void> {
  const cwd = process.cwd();

  if (pkgName) {
    const info = await fetchPackageInfo(pkgName, cwd);
    printPackageInfo(info);
  } else {
    const packages = await fetchLocalPackages(cwd);
    printLocalPackages(packages);
  }
}

export { PackageInfo };
