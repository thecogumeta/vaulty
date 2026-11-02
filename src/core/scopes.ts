export const scopeToDir: Record<string, string> = {
  dependencies: "Packages",
  "server-dependencies": "ServerPackages",
  "client-dependencies": "ClientPackages",
  "dev-dependencies": "DevPackages",
};

export const packageScopes: (keyof typeof scopeToDir)[] = [
  "dependencies",
  "server-dependencies",
  "client-dependencies",
  "dev-dependencies",
];
