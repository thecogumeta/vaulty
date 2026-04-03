import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import {
  activateVerbose,
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

  .option("verbose", {
    alias: "v",
    type: "boolean",
    description: "Enable verbose logging",
    default: false,
  })

  .middleware((argv) => {
    if (argv.verbose) {
      activateVerbose();
    }
  })

  .command(
    "init",
    "Initialize a new vaulty project",
    () => {},
    async () => {
      vaultyInit();
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
      } catch (err: any) {
        console.error(err.message);
        process.exit(1);
      }
    },
  )

  .parse();
