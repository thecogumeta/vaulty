import { execSync } from "node:child_process";

export function run(cmd: string): string {
  return execSync(cmd, {
    stdio: ["inherit"],
    encoding: "utf-8",
  });
}
