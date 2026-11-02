import { vaultyUpdate } from "../../vaulty";
import { cmd } from "../cmd";
import { packageScopes } from "../../core/scopes";

const scopeList = packageScopes.join(", ");

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
        describe: `Scope to update (${scopeList})`,
        type: "string",
      }),
  handler: cmd(async (argv) => {
    await vaultyUpdate(argv.package, argv.scope);
  }),
};
