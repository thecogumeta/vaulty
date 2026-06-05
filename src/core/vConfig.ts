import fs from "fs";
import path from "path";
import toml from "@iarna/toml";
import { getUsername } from "./context";
import { log } from "./logging";

export function handleDependencie(dep: string): {
  repo: string;
  provider: string;
  ref: string;
} {
  if (dep.startsWith("file:")) {
    const repo = dep.slice("file:".length);
    if (!repo) {
      throw new Error(
        `Invalid local dependency "${dep}". Expected format: "file:../path/to/package".`,
      );
    }
    return { repo, provider: "local", ref: "local" };
  }

  let provider: string;
  let providerRest: string;

  if (dep.includes(":")) {
    [provider, providerRest] = dep.split(":");
  } else {
    provider = "github.com";
    providerRest = dep;
  }

  const atIndex = providerRest.lastIndexOf("@");

  if (atIndex === -1) {
    throw new Error(
      `Invalid dependency format for "${dep}". Expected format: "provider:repo@ref" or "repo@ref".`,
    );
  }

  const repo = providerRest.slice(0, atIndex);
  const ref = providerRest.slice(atIndex + 1);

  if (!repo || !ref) {
    throw new Error(
      `Invalid dependency format for "${dep}". Expected format: "provider:repo@ref" or "repo@ref".`,
    );
  }

  return { repo, provider, ref };
}

export function initialize(targetDir = process.cwd()) {
  const packageName = path.basename(targetDir);

  const configPath = path.join(targetDir, "vaulty.toml");

  if (fs.existsSync(configPath)) {
    throw new Error("vaulty.toml already exists in the target directory.");
  }

  fs.writeFileSync(
    configPath,

    toml.stringify({
      package: {
        name: `${getUsername()}/${packageName}`,
        version: "1.0.0",

        exclude: ["**"],

        include: [
          "src/**/*",
          "lib/**/*",
          "default.project.json",
          "vaulty.toml",
        ],
      },

      dependencies: {},
    }),
  );

  log(`Initialized vaulty.toml in ${targetDir}`);
}
