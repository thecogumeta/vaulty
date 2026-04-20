import { vaultyLock } from "../../vaulty";
import { cmd } from "../cmd";

export default {
  command: "update",
  describe: "Update the vaulty.lock file",
  handler: cmd(async () => {
    vaultyLock();
  }),
};
