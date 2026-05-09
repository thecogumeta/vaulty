import { vaultyInit } from "../../vaulty";
import { cmd } from "../cmd";

export default {
  command: "init",
  describe: "Initialize a new vaulty project",
  handler: cmd(async () => {
    await vaultyInit();
  }),
};
