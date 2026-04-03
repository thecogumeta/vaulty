import fs from "fs";
import path from "path";
import { execSync } from "child_process";

export function repoExists(repo: string): "ok" | "private" | "notfound" {
  try {
    execSync(`git ls-remote https://github.com/${repo}`, { stdio: "ignore" });
    return "ok";
  } catch {
    try {
      execSync(`git ls-remote git@github.com:${repo}.git`, { stdio: "ignore" });
      return "ok";
    } catch {
      const response = execSync(
        `curl -s -o /dev/null -w "%{http_code}" https://api.github.com/repos/${repo}`,
      ).toString();
      return response === "404" ? "notfound" : "private";
    }
  }
}

export function checkDir() {
  const configPath = path.join(process.cwd(), "vaulty.toml");
  if (!fs.existsSync(configPath)) {
    console.error("vaulty.toml not found in current directory");
    process.exit(1);
  }

  try {
    execSync("wally --version", { stdio: "ignore" });
  } catch {
    console.error("wally is not installed or not in PATH");
    process.exit(1);
  }

  const wallyConfigPath = path.join(process.cwd(), "wally.toml");
  if (!fs.existsSync(wallyConfigPath)) {
    console.error("wally.toml not found in current directory");
    process.exit(1);
  }

  try {
    execSync("git --version", { stdio: "ignore" });
  } catch {
    console.error("git is not installed or not in PATH");
    process.exit(1);
  }
}

export function isValidTag(repo: string, tag: string): boolean {
  try {
    const output = execSync(
      `git ls-remote --tags https://github.com/${repo}.git`,
      { encoding: "utf-8" },
    );

    const tags = output
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.split("refs/tags/")[1])
      .map((t) => t.replace(/\^\{\}$/, ""));

    return tags.includes(tag) || tags.includes(`v${tag}`);
  } catch {
    return false;
  }
}
