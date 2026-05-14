import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import init from "./commands/init";
import lock from "./commands/lock";
import install from "./commands/install";
import update from "./commands/update";

import { activeVerbose } from "../core/logging";
import outdated from "./commands/outdated";
import initPackage from "./commands/init-package";

async function main(): Promise<void> {
  await yargs(hideBin(process.argv))
    .scriptName("vaulty")
    .strict()
    .demandCommand()
    .help()

    .option("verbose", {
      alias: "v",
      describe: "Enable verbose logging",
      type: "boolean",
      default: false,
    })

    .middleware((argv) => {
      if (argv.verbose) activeVerbose();
    })

    .command(install)
    .command(init)
    .command(initPackage)
    .command(lock)
    .command(outdated)
    .command(update)

    .parseAsync();
}

main();
