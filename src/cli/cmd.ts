import { vlog } from "../core/logging";

export function cmd(fn: (argv: any) => any) {
  return async (argv: any) => {
    try {
      await fn(argv);
    } catch (err: unknown) {
      if (err instanceof Error) {
        console.error(`Error: ${err.message}`);

        vlog(err.stack);
      } else {
        console.error(
          `This is likely a Vaulty bug. Please report it to the developers:\n${err}`,
        );
      }

      process.exit(1);
    }
  };
}
