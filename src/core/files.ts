import { globSync } from "glob";
import { minimatch } from "minimatch";

export function getFilesToCopy(
  cloneDir: string,
  include: string[],
  exclude: string[],
) {
  const allFiles = globSync("**/*", { cwd: cloneDir, nodir: true });

  const afterExclude = allFiles.filter(
    (file) =>
      !exclude.some((pattern) => minimatch(file, pattern, { dot: true })),
  );

  const includedFiles = include.flatMap((pattern) =>
    globSync(pattern, { cwd: cloneDir, nodir: true }),
  );

  return [...new Set([...afterExclude, ...includedFiles])];
}
