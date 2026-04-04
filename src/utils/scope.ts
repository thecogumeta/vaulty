export type Scope = "shared" | "server" | "client" | "dev";

export function getScopeTomlSection(scope: Scope) {
  return scope === "shared" ? "dependencies" : `${scope}-dependencies`;
}

export function getScopeFolderPrefix(scope: Scope) {
  return scope === "shared" ? "Packages" : capitalize(scope) + "Packages";
}

export function getScopeLogName(scope: Scope) {
  return scope === "shared"
    ? "Dependencies"
    : capitalize(scope) + " Dependencies";
}

function capitalize(str: string) {
  if (!str) return "";
  return str[0].toUpperCase() + str.slice(1);
}
