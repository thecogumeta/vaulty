import { vaultyInit } from "../../vaulty";
import { cmd } from "../cmd";

export default {
  command: "init-package",
  describe: "Initialize a new vaulty package",
  handler: cmd(async () => {
    await vaultyInit(true);
  }),
};
