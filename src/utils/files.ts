import fs from "fs";
import path from "path";
import { globSync } from "glob";

export function getFilesToCopy(
  cloneDir: string,
  include: string[],
  exclude: string[],
) {
  const includedFiles = include.flatMap((pattern) =>
    globSync(pattern, { cwd: cloneDir, nodir: true }),
  );

  return includedFiles.filter(
    (file) =>
      !exclude.some((excl) => file.startsWith(excl.replace(/\/\*\*$/, ""))),
  );
}

export function copyFiles(files: string[], from: string, to: string) {
  fs.mkdirSync(to, { recursive: true });

  for (const file of files) {
    const src = path.join(from, file);
    const dest = path.join(to, file);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}
