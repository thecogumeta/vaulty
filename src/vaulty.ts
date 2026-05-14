import { initialize } from "./core/vConfig";
import { generateVaultyLock, getOutdatedPackages } from "./core/vLock";
import { installVaulty } from "./core/packages";
import { initializePackage } from "./core/init-package";

export async function vaultyInit(isPackage: boolean = false) {
  isPackage ? await initializePackage() : initialize();
}

export async function vaultyLock() {
  await generateVaultyLock();
}

export async function vaultyOutdated() {
  await getOutdatedPackages();
}

export async function vaultyUpdate(onlyPackage?: string, onlyScope?: string) {
  await generateVaultyLock(true, onlyPackage, onlyScope);
}

export async function vaultyInstall() {
  await installVaulty();
}
