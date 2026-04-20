let verbose = false;

export function activeVerbose() {
  verbose = true;
}

export function log(...args: any[]) {
  console.log(...args);
}

export function vlog(...args: any[]) {
  if (!verbose) return;

  log(...args);
}
