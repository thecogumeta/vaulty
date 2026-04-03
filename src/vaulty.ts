import fs from "fs";
import path from "path";
import TOML from "@iarna/toml";
import { checkDir, isValidTag, repoExists } from "./utils/checks";
import { getFilesToCopy, copyFiles } from "./utils/files";
import { run, getLatestTag } from "./utils/git";

export function vaultyInit() {
  fs.writeFileSync(path.join(process.cwd(), "vaulty.toml"), `[dependencies]\n`);
}

export function addPackage(name: string, repo: string, tag: string) {
  checkDir();
  const configPath = path.join(process.cwd(), "vaulty.toml");
  const config: any = TOML.parse(fs.readFileSync(configPath, "utf-8"));
  config.dependencies ||= {};
  config.dependencies[name] = `${repo}@${tag}`;
  fs.writeFileSync(configPath, TOML.stringify(config));
  console.log(`Added ${repo}@${tag}`);
}

export function removePackage(name: string) {
  checkDir();
  const configPath = path.join(process.cwd(), "vaulty.toml");
  const config: any = TOML.parse(fs.readFileSync(configPath, "utf-8"));
  config.dependencies ||= {};

  const dependencie = config.dependencie[name];
  config.dependencies[name] = null;

  fs.writeFileSync(configPath, TOML.stringify(config));
  console.log(`Removed ${dependencie}`);
}

export function installPackages() {
  checkDir();
  run("wally install");

  const vaultyConfigPath = path.join(process.cwd(), "vaulty.toml");
  const vaultyConfig: any = TOML.parse(
    fs.readFileSync(vaultyConfigPath, "utf-8"),
  );
  const deps = vaultyConfig.dependencies ?? {};

  for (const [name, value] of Object.entries(deps) as [string, string][]) {
    installPackage(name, value);
  }
}

function installPackage(name: string, value: string) {
  let [repo, tag] = value.split("@");

  validateRepo(repo);
  tag = resolveTag(repo, tag);

  const [userName, repoName] = repo.split("/");
  const cloneDir = path.join(
    process.cwd(),
    "Packages",
    "_Index",
    `${userName}_${repoName}@${tag}`,
    name,
  );

  const tempDir = cloneDir + "-";
  run(
    `git clone --branch v${tag} --depth 1 https://github.com/${repo} ${tempDir}`,
  );
  if (fs.existsSync(cloneDir)) fs.rmSync(cloneDir, { recursive: true });

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

  fs.writeFileSync(
    path.join(process.cwd(), "Packages", `${name}.lua`),
    `return require(script.Parent._Index["${userName}_${repoName}@${tag}"]["${name}"])\n`,
  );

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
