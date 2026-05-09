import { initialize } from "./core/vConfig";
import { generateVaultyLock } from "./core/vLock";
import { installVaulty } from "./core/packages";

export async function vaultyInit() {
  initialize();
}

export async function vaultyLock() {
  await generateVaultyLock();
}

export async function vaultyUpdate() {
  await generateVaultyLock(true);
}

export async function vaultyInstall() {
  await installVaulty();
}
