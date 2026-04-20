export function cmd(fn: (argv: any) => any) {
  return async (argv: any) => {
    try {
      await fn(argv);
    } catch (e: any) {
      console.error(e.message);
      process.exit(1);
    }
  };
}
