import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import {
  addPackage,
  installPackages,
  removePackage,
  vaultyInit,
} from "./vaulty";

interface AddArgs {
  name: string;
  package: string;
}

function parsePackage(pkg: string) {
  const [repo, tag] = pkg.split("@");
  if (!repo || !tag || repo.split("/").length !== 2) {
    throw new Error("Invalid format! Use user/repo@tag");
  }
  return { repo, tag };
}

yargs(hideBin(process.argv))
  .scriptName("vaulty")
  .strict()
  .demandCommand()
  .help()

  .command(
    "init",
    "Initialize a new vaulty project",
    () => {},
    async () => {
      vaultyInit();
      console.log("Vaulty project initialized.");
    },
  )

  .command<AddArgs>(
    "add <name> <package>",
    "Add a package from Git",
    (yargs) => {
      yargs
        .positional("name", { type: "string", describe: "Package name" })
        .positional("package", {
          type: "string",
          describe: "GitHub repository (user/repo@tag)",
        });
    },
    async (argv) => {
      try {
        const { repo, tag } = parsePackage(argv.package);
        await addPackage(argv.name, repo, tag);
        console.log(`Added ${argv.name} from ${repo}@${tag}`);
      } catch (err: any) {
        console.error(err.message);
        process.exit(1);
      }
    },
  )

  .command(
    "remove <name>",
    "Remove a package from Git",
    (yargs) => {
      yargs.positional("name", { type: "string", describe: "Package name" });
    },
    async (argv: any) => {
      try {
        await removePackage(argv.name);
        console.log(`Removed package ${argv.name}`);
      } catch (err: any) {
        console.error(err.message);
        process.exit(1);
      }
    },
  )

  .command(
    "install",
    "Install all of the dependencies of this project",
    () => {},
    async () => {
      try {
        await installPackages();
        console.log("All packages installed.");
      } catch (err: any) {
        console.error(err.message);
        process.exit(1);
      }
    },
  )

  .parse();
