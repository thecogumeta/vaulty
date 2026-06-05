import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import * as p from "@clack/prompts";
import color from "picocolors";
import { initialize } from "./vConfig";
import { vlog } from "./logging";

interface InitContext {
  packageName: string;
  targetDir: string;
  resolvedDir: string;
}

async function initializeDirectories(ctx: InitContext) {
  vlog("Initializing directories");

  await mkdir(path.join(ctx.resolvedDir, "lib"), {
    recursive: true,
  });

  await mkdir(path.join(ctx.resolvedDir, "tests"), {
    recursive: true,
  });

  await writeFile(path.join(ctx.resolvedDir, "lib/init.luau"), "return {}\n", {
    flag: "wx",
  }).catch(() => {});
}

async function initializeProjectsJson(ctx: InitContext) {
  vlog("Initializing project files");

  const defaultProject = {
    name: ctx.packageName,
    tree: {
      $path: "lib",
    },
  };

  const testsProject = {
    name: `${ctx.packageName} Test-Runner`,
    tree: {
      $className: "DataModel",
      ReplicatedStorage: {
        [ctx.packageName]: {
          $path: "lib",
        },
      },
      ServerScriptService: {
        Tests: {
          $path: "tests",
        },
      },
    },
  };

  await writeFile(
    path.join(ctx.resolvedDir, "default.project.json"),
    JSON.stringify(defaultProject, null, 2),
    {
      flag: "wx",
    },
  ).catch(() => {});

  await writeFile(
    path.join(ctx.resolvedDir, "tests.project.json"),
    JSON.stringify(testsProject, null, 2),
    {
      flag: "wx",
    },
  ).catch(() => {});
}

async function initializePackageJson(ctx: InitContext) {
  vlog("Initializing package.json");

  const packageJson = {
    scripts: {
      "gen.map": "rojo sourcemap default.project.json -o sourcemap.json",
      "gen.testsmap": "rojo sourcemap tests.project.json -o sourcemap.json",
      "sync.tests": "rojo serve tests.project.json",
    },
  };

  await writeFile(
    path.join(ctx.resolvedDir, "package.json"),
    JSON.stringify(packageJson, null, 2),
    {
      flag: "wx",
    },
  ).catch(() => {});
}

async function initializeExtraFiles(ctx: InitContext) {
  vlog("Initializing extra files");

  const luaurc = {
    languageMode: "strict",
  };

  await writeFile(
    path.join(ctx.resolvedDir, ".luaurc"),
    JSON.stringify(luaurc, null, 2),
    {
      flag: "wx",
    },
  );

  const styluaConfig = `syntax = "Luau"
indent_type = "Tabs"
column_width = 75
quote_style = "ForceDouble"
call_parentheses = "Input"
collapse_simple_statement = "Always"
line_endings = "Unix"
block_newline_gaps = "Never"
`;

  await writeFile(path.join(ctx.resolvedDir, "stylua.toml"), styluaConfig, {
    flag: "wx",
  });

  await writeFile(
    path.join(ctx.resolvedDir, ".gitignore"),
    ["sourcemap.json", "*Packages/", "*.rbx*", ""].join("\n"),
    {
      flag: "wx",
    },
  ).catch(() => {});
}

export async function initializePackage() {
  console.clear();

  p.intro(color.bgCyan(color.black(" Vaulty ")));

  const targetDir = await p.text({
    message: "Directory",
    placeholder: "./my-package",
    initialValue: ".",
  });

  if (p.isCancel(targetDir)) {
    p.cancel("Operation cancelled.");
    process.exit(0);
  }

  const resolvedDir = path.resolve(targetDir);

  const defaultPackageName =
    targetDir === "."
      ? path.basename(process.cwd())
      : path.basename(resolvedDir);

  const packageName = await p.text({
    message: "Package name",
    placeholder: "my-package",
    initialValue: defaultPackageName,

    validate(value) {
      if (!value) {
        return "Package name is required";
      }
    },
  });

  if (p.isCancel(packageName)) {
    p.cancel("Operation cancelled.");
    process.exit(0);
  }

  const ctx: InitContext = {
    packageName,
    targetDir,
    resolvedDir,
  };

  p.note(`Creating ${packageName}`);

  await mkdir(ctx.resolvedDir, {
    recursive: true,
  });

  vlog("Initializing vaulty.toml");
  initialize(ctx.resolvedDir);
  await initializeDirectories(ctx);
  await initializeProjectsJson(ctx);
  await initializePackageJson(ctx);
  await initializeExtraFiles(ctx);

  try {
    execSync("rojo sourcemap tests.project.json -o sourcemap.json", {
      stdio: "ignore",
      cwd: ctx.resolvedDir,
    });
  } catch {}
  try {
    execSync("git init", {
      stdio: "ignore",
      cwd: ctx.resolvedDir,
    });
  } catch {}
  try {
    execSync("vaulty lock", {
      stdio: "ignore",
      cwd: ctx.resolvedDir,
    });
  } catch {}

  p.outro("Package initialized.");
}
