import fs from "fs";
import path from "path";
import TOML from "@iarna/toml";
import { checkDir, isValidTag, repoExists } from "./utils/checks";
import { getFilesToCopy, copyFiles } from "./utils/files";
import { getLatestTag } from "./utils/git";
import { execSync } from "child_process";
import {
  getScopeFolderPrefix,
  getScopeLogName,
  getScopeTomlSection,
  Scope,
} from "./utils/scope";

let verbose = false;

export function activateVerbose() {
  verbose = true;
}

function run(command: string) {
  if (verbose) console.log(` > ${command}`);
  execSync(command, { stdio: "ignore" });
}

function vlog(message: string) {
  if (!verbose) return;

  console.log(message);
}

export function vaultyInit() {
  fs.writeFileSync(path.join(process.cwd(), "vaulty.toml"), `[dependencies]\n`);
  console.log("Vaulty project initialized.");
}

export function addPackage(
  name: string,
  repo: string,
  tag: string,
  scope: Scope,
) {
  checkDir();

  const tomlSection = getScopeTomlSection(scope);
  const configPath = path.join(process.cwd(), "vaulty.toml");
  const config: any = TOML.parse(fs.readFileSync(configPath, "utf-8"));

  config[tomlSection] ||= {};
  config[tomlSection][name] = `${repo}@${tag}`;
  fs.writeFileSync(configPath, TOML.stringify(config));
  console.log(`Added  ${name} (${repo}@${tag}) to ${getScopeLogName(scope)}`);
}

export function removePackage(name: string, scope: Scope) {
  checkDir();
  const configPath = path.join(process.cwd(), "vaulty.toml");
  const config: any = TOML.parse(fs.readFileSync(configPath, "utf-8"));
  const tomlSection = getScopeTomlSection(scope);

  config[tomlSection] ||= {};

  const dependencie = config[tomlSection][name];
  config[tomlSection][name] = null;

  fs.writeFileSync(configPath, TOML.stringify(config));
  console.log(`Removed ${dependencie}`);
}

export function installPackages() {
  checkDir();

  vlog("\nInstalling wally dependencies");
  run("wally install");
  vlog("Installed wally dependencies");

  const vaultyConfigPath = path.join(process.cwd(), "vaulty.toml");
  const vaultyConfig: any = TOML.parse(
    fs.readFileSync(vaultyConfigPath, "utf-8"),
  );

  const scopes: Scope[] = ["shared", "dev", "client", "server"];
  for (const scope of scopes) {
    const section = getScopeTomlSection(scope);
    const deps: Record<string, string> = vaultyConfig[section] ?? {};

    if (Object.keys(deps).length === 0) continue;

    vlog(`\nInstalling vaulty ${getScopeLogName(scope)}`);

    for (const [name, value] of Object.entries(deps)) {
      installPackage(name, value, scope);
    }
  }

  console.log("\nAll dependencies installed.");
}

function installPackage(name: string, value: string, scope: Scope) {
  let [repo, tag] = value.split("@");

  vlog(`\nStarting ${name} installing process`);

  validateRepo(repo);
  tag = resolveTag(repo, tag);

  const pkgFolder = getScopeFolderPrefix(scope);
  const [userName, repoName] = repo.split("/");
  const cloneDir = path.join(
    process.cwd(),
    pkgFolder,
    "_Index",
    `${userName}_${repoName}@${tag}`,
    name,
  );

  vlog(`Cloning ${name} github repository (${value})`);

  const tempDir = cloneDir + "-";
  run(
    `git clone --branch v${tag} --depth 1 https://github.com/${repo} "${tempDir}"`,
  );
  if (fs.existsSync(cloneDir)) fs.rmSync(cloneDir, { recursive: true });

  vlog(`Filtering ${name} files`);

  const wallyPath = path.join(tempDir, "wally.toml");
  if (!fs.existsSync(wallyPath))
    throw new Error(`No wally.toml found in ${tempDir}`);

  const pkgConfig: any = TOML.parse(fs.readFileSync(wallyPath, "utf-8"));
  const include = pkgConfig.package?.include ?? [];
  const exclude = pkgConfig.package?.exclude ?? ["**"];

  const files = getFilesToCopy(tempDir, include, exclude);
  copyFiles(files, tempDir, cloneDir);
  fs.rmSync(tempDir, { recursive: true });

  const projDir = path.join(cloneDir, "default.project.json");
  if (!fs.existsSync(projDir))
    throw new Error(`No default.project.json found in ${cloneDir}`);
  const projInfo: any = JSON.parse(fs.readFileSync(projDir, "utf-8"));

  vlog(`Writing ${name} alias scripts`);

  fs.writeFileSync(
    path.join(process.cwd(), pkgFolder, `${name}.lua`),
    `return require(script.Parent._Index["${userName}_${repoName}@${tag}"]["${name}"])\n`,
  );

  fs.writeFileSync(
    path.join(process.cwd(), pkgFolder, `${name}.d.ts`),
    `import * as lib from "./_Index/${userName}_${repoName}@${tag}/${name}/${projInfo.tree["$path"]}";\nexport = lib;\n`,
  );

  vlog(`Done installing ${name}`);
  console.log(`Installed ${repo}@${tag}`);
}

function validateRepo(repo: string) {
  const status = repoExists(repo);
  if (status === "notfound") throw new Error(`Repository ${repo} not found.`);
  if (status === "private")
    throw new Error(
      `Repository ${repo} is private or inaccessible. Authenticate with Git.`,
    );
}

function resolveTag(repo: string, tag: string | undefined) {
  if (!tag || tag === "*") {
    const latest = getLatestTag(repo);
    if (!latest)
      throw new Error(
        `Unable to determine the latest tag for repository ${repo}`,
      );
    tag = latest.replace(/^v/, "");
  }
  if (!isValidTag(repo, tag))
    throw new Error(`Tag ${tag} does not exist in repository ${repo}`);
  return tag;
}
