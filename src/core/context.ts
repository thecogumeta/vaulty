import os from "os";

export function getUsername(): string {
  try {
    return os.userInfo().username;
  } catch {
    return process.env.USER || process.env.USERNAME || "unknown";
  }
}
