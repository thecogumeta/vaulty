import { vaultyInfo } from "../../vaulty";
import { cmd } from "../cmd";

export default {
  command: "info [package]",
  describe: "Show information about a package",
  builder: (yargs: any) =>
    yargs.positional("package", {
      describe:
        "Package spec (e.g. thecogumeta/rbx-acidsignal, github.com:roblox/ecs@main, file:../my-package)",
      type: "string",
    }),
  handler: cmd(async (argv) => {
    await vaultyInfo(argv.package);
  }),
};
