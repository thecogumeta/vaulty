import { initialize } from "./core/vConfig";
import { generateVaultyLock } from "./core/vLock";
import { installVaulty } from "./core/packages";

export function vaultyInit() {
  initialize();
}

export function vaultyLock() {
  generateVaultyLock();
}

export function vaultyUpdate() {
  generateVaultyLock(true);
}

export function vaultyInstall() {
  installVaulty();
}
