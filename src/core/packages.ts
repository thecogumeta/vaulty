import fs from "fs";
import path from "path";
import toml from "@iarna/toml";
import { ensureGitRepo } from "./git";
import { getFilesToCopy } from "./files";
import { generateVaultyLock, LockContent, PackageEntry } from "./vLock";
import { scopeToDir } from "./scopes";
import { log, vlog } from "./logging";
import { execSync } from "child_process";
import {
  ExportedType,
  buildTypeExports,
  findEntryFile,
  scanExportedTypes,
} from "./luauTypes";

interface TargetInfo {
  projName?: string;
  types: ExportedType[];
}

function readLock(lockPath: string): LockContent {
  return toml.parse(
    fs.readFileSync(lockPath, "utf-8"),
  ) as unknown as LockContent;
}

function readToml(filePath: string): Record<string, any> {
  if (!fs.existsSync(filePath)) return {};
  const raw = fs.readFileSync(filePath, "utf-8");
  return toml.parse(raw) as Record<string, any>;
}

function writeRedirect(
  filePath: string,
  requirePath: string,
  types: ExportedType[] = [],
): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  const typeExports = buildTypeExports(types);
  const content = typeExports
    ? `local Module = require(${requirePath})\n\n${typeExports}\n\nreturn Module\n`
    : `return require(${requirePath})\n`;

  fs.writeFileSync(filePath, content, "utf-8");
}

function installFiles(
  srcDir: string,
  destDir: string,
  include: string[],
  exclude: string[],
): void {
  fs.mkdirSync(destDir, { recursive: true });
  const files = getFilesToCopy(srcDir, include, exclude);
  for (const file of files) {
    const destPath = path.join(destDir, file);
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.copyFileSync(path.join(srcDir, file), destPath);
  }
}

function formatPkgLine(
  index: number,
  total: number,
  pkg: PackageEntry,
): string {
  const idx = `[${index}/${total}]`;
  const name = pkg.name.padEnd(30);
  const scope = `(${pkg.scope})`.padEnd(20);
  const source = pkg.source;
  return `${idx} ${name} ${scope} ${source}`;
}

function runHooks(hooks?: string | string[], name = "Hook"): void {
  if (!hooks) return;
  const hooksList = Array.isArray(hooks) ? hooks : [hooks];

  for (const hook of hooksList) {
    log(`[${name}] Running: ${hook}`);

    try {
      execSync(hook, {
        stdio: "ignore",
        env: process.env,
      });
    } catch (error) {
      throw new Error(
        `[${name}] Failed while executing "${hook}"\n${String(error)}`,
      );
    }
  }
}

export async function installVaulty(): Promise<void> {
  await generateVaultyLock();
  const cwd = process.cwd();

  const lock = readLock(path.join(cwd, "vaulty.lock"));
  const config = readToml(path.join(cwd, "vaulty.toml"));

  if (!config.preservePackagesOnInstall)
    for (const dir of Object.values(scopeToDir)) {
      const fullPath = path.join(cwd, dir);
      if (fs.existsSync(fullPath)) {
        vlog(`Clearing ${dir}...`);
        fs.rmSync(fullPath, { recursive: true, force: true });
      }
    }

  const targetCache = new Map<string, TargetInfo | undefined>();

  async function loadTargetInfo(
    folder: string,
  ): Promise<TargetInfo | undefined> {
    const targetPkg = lock.package.find((p) => p.folder === folder);
    if (!targetPkg) return undefined;
    const targetRepoPath =
      targetPkg.provider === "local"
        ? path.resolve(cwd, targetPkg.source.replace(/^file:/, ""))
        : await ensureGitRepo(
            targetPkg.provider,
            targetPkg.source.replace(`${targetPkg.provider}:`, ""),
            targetPkg.ref,
          );
    const targetDefaultProject = path.join(
      targetRepoPath,
      "default.project.json",
    );

    if (!fs.existsSync(targetDefaultProject)) return { types: [] };

    const proj = JSON.parse(fs.readFileSync(targetDefaultProject, "utf-8"));
    const entry = findEntryFile(
      targetRepoPath,
      typeof proj.tree?.$path === "string" ? proj.tree.$path : undefined,
    );
    const types = entry
      ? scanExportedTypes(fs.readFileSync(entry, "utf-8"))
      : [];

    return { projName: proj.name as string | undefined, types };
  }

  async function getTargetInfo(
    folder: string,
  ): Promise<TargetInfo | undefined> {
    if (targetCache.has(folder)) return targetCache.get(folder);
    const info = await loadTargetInfo(folder);
    targetCache.set(folder, info);
    return info;
  }

  const scripts: Record<string, string | string[]> = config.scripts ?? {};
  const installed = new Set<string>();
  const total = lock.package.length;
  let index = 0;

  const dtsEntries = new Map<string, string>();

  runHooks(scripts.preinstall, "Pre-Install Script");

  for (const pkg of lock.package) {
    const key = `${pkg.scope}:${pkg.folder}`;
    if (installed.has(key)) continue;
    installed.add(key);
    index++;
    log(formatPkgLine(index, total, pkg));

    const pkgDir = path.join(cwd, scopeToDir[pkg.scope] ?? "Packages");
    const destDir = path.join(pkgDir, "_Index", pkg.folder);
    const repoPath =
      pkg.provider === "local"
        ? path.resolve(cwd, pkg.source.replace(/^file:/, ""))
        : await ensureGitRepo(
            pkg.provider,
            pkg.source.replace(`${pkg.provider}:`, ""),
            pkg.ref,
          );
    let pkgConfig: any = fs.existsSync(path.join(repoPath, "vaulty.toml"))
      ? toml.parse(fs.readFileSync(path.join(repoPath, "vaulty.toml"), "utf-8"))
      : undefined;

    if (!pkgConfig) {
      if (!fs.existsSync(path.join(repoPath, "wally.toml"))) {
        vlog(`Skipping ${pkg.source}: no config found`);
        continue;
      }

      const pkgWallyConfig: any = toml.parse(
        fs.readFileSync(path.join(repoPath, "wally.toml"), "utf-8"),
      );

      pkgWallyConfig.package ??= {};
      pkgConfig = {
        package: {
          include: pkgWallyConfig.package.include,
          exclude: pkgWallyConfig.package.exclude,
        },
      };
    }

    const include: string[] = pkgConfig.package?.include ?? [];
    const exclude: string[] = pkgConfig.package?.exclude ?? [];
    const defaultProjectPath = path.join(repoPath, "default.project.json");
    let finalDir = destDir;
    let sourceSubdir = "";

    if (fs.existsSync(defaultProjectPath)) {
      const proj = JSON.parse(fs.readFileSync(defaultProjectPath, "utf-8"));

      if (proj.tree?.$className !== undefined) {
        throw new Error(
          `Package ${pkg.folder} has a non-pure default.project.json (tree.$className is set to "${proj.tree.$className}"). ` +
            `Only pure $path trees are supported.`,
        );
      }
      if (!proj.name) {
        throw new Error(
          `Package ${pkg.folder} has a default.project.json without a name field.`,
        );
      }

      finalDir = path.join(destDir, proj.name);

      if (typeof proj.tree?.$path === "string") {
        sourceSubdir = path.extname(proj.tree.$path)
          ? path.dirname(proj.tree.$path)
          : proj.tree.$path;
      }
    }

    vlog(`  installed from: ${repoPath}`);
    vlog(`  include: ${include.join(", ")}`);
    vlog(`  exclude: ${exclude.join(", ")}`);
    vlog(`  redirects: ${pkg.redirects?.length ?? 0} created`);
    vlog(`  destination folder: ${finalDir}`);
    installFiles(repoPath, finalDir, include, exclude);

    const dtsSource = path.join(finalDir, sourceSubdir, "index.d.ts");
    if (fs.existsSync(dtsSource)) {
      dtsEntries.set(pkg.folder, path.join(finalDir, sourceSubdir, "index"));
      vlog(`  type declarations found: ${dtsSource}`);
    } else {
      vlog(`  no index.d.ts found at ${dtsSource}`);
    }

    for (const redirect of pkg.redirects ?? []) {
      const target = await getTargetInfo(redirect.target);
      const projSuffix = target?.projName ? `["${target.projName}"]` : "";
      vlog(
        `  redirect ${redirect.name}: ${target?.types.length ?? 0} type exports`,
      );
      writeRedirect(
        path.join(
          finalDir,
          scopeToDir[pkg.scope] ?? "Packages",
          `${redirect.name}.luau`,
        ),
        `script.Parent.Parent.Parent.Parent["${redirect.target}"]${projSuffix}`,
        target?.types,
      );
    }
  }

  for (const rr of lock.root_redirects ?? []) {
    const pkgDir = path.join(cwd, scopeToDir[rr.scope] ?? "Packages");
    const target = await getTargetInfo(rr.target);
    const projSuffix = target?.projName ? `["${target.projName}"]` : "";
    vlog(`root redirect ${rr.name}: ${target?.types.length ?? 0} type exports`);
    writeRedirect(
      path.join(pkgDir, `${rr.name}.luau`),
      `script.Parent._Index["${rr.target}"]${projSuffix}`,
      target?.types,
    );

    const dtsEntry = dtsEntries.get(rr.target);
    if (dtsEntry) {
      const dtsPath = path.join(pkgDir, `${rr.name}.d.ts`);
      let relImport = path
        .relative(path.dirname(dtsPath), dtsEntry)
        .split(path.sep)
        .join("/");
      if (!relImport.startsWith(".")) relImport = `./${relImport}`;

      fs.writeFileSync(
        dtsPath,
        `export * from "${relImport}";\nexport { default } from "${relImport}";\n`,
        "utf-8",
      );
      vlog(`  type declarations: ${rr.name}.d.ts`);
    }
  }

  runHooks(scripts.postinstall, "Post-Install Script");

  log(`\n${index} packages installed`);
}
