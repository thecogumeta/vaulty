import { vaultyOutdated } from "../../vaulty";
import { cmd } from "../cmd";

export default {
  command: "outdated",
  describe: "Show outdated dependencies",
  handler: cmd(async () => {
    await vaultyOutdated();
  }),
};
