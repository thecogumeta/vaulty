import { vaultyUpdate } from "../../vaulty";
import { cmd } from "../cmd";

export default {
  command: "update [package]",
  describe: "Update the vaulty.lock file",
  builder: (yargs: any) =>
    yargs
      .positional("package", {
        describe: "Package name to update",
        type: "string",
      })
      .option("scope", {
        alias: "s",
        describe:
          "Scope to update (dependencies, server-dependencies, client-dependencies, dev-dependencies)",
        type: "string",
      }),
  handler: cmd(async (argv) => {
    await vaultyUpdate(argv.package, argv.scope);
  }),
};
