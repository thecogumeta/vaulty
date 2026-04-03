import { execSync } from "child_process";

export function run(command: string, ignoreOutput = true) {
  execSync(command, { stdio: ignoreOutput ? "ignore" : "inherit" });
}

export function getLatestTag(repo: string): string | null {
  try {
    const output = execSync(
      `git ls-remote --tags https://github.com/${repo}.git`,
      { encoding: "utf-8" },
    );
    const tags = output
      .split("\n")
      .map((line) => line.split("refs/tags/")[1]?.replace(/\^\{\}$/, ""))
      .filter(Boolean);

    const sorted = tags.sort((a, b) => {
      const pa = a.replace(/^v/, "").split(".").map(Number);
      const pb = b.replace(/^v/, "").split(".").map(Number);
      for (let i = 0; i < 3; i++)
        if ((pa[i] || 0) !== (pb[i] || 0)) return (pb[i] || 0) - (pa[i] || 0);
      return 0;
    });

    return sorted[0] || null;
  } catch {
    return null;
  }
}
