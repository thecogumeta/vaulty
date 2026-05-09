import { vaultyLock } from "../../vaulty";
import { cmd } from "../cmd";

export default {
  command: "lock",
  describe: "Generate a vaulty.lock file",
  handler: cmd(async () => {
    await vaultyLock();
  }),
};
