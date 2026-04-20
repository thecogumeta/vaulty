import { vaultyInstall } from "../../vaulty";
import { cmd } from "../cmd";

export default {
  command: "install",
  describe: "Install vaulty dependencies",
  handler: cmd(async () => {
    vaultyInstall();
  }),
};
