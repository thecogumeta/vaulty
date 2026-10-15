import fs from "fs";
import path from "path";

export interface ExportedType {
  name: string;
  declParams: string[];
  useParams: string[];
}

function stripCommentsAndStrings(src: string): string {
  const out: string[] = [];
  const n = src.length;
  const blank = (s: string) => s.replace(/[^\n]/g, " ");
  const longOpen = /\[(=*)\[/y;
  let i = 0;

  const longBracketEnd = (pos: number): number | undefined => {
    longOpen.lastIndex = pos;
    const m = longOpen.exec(src);
    if (!m) return undefined;
    const close = `]${m[1]}]`;
    const end = src.indexOf(close, pos + m[0].length);
    return end === -1 ? n : end + close.length;
  };

  while (i < n) {
    const ch = src[i];

    if (ch === "-" && src[i + 1] === "-") {
      let end = longBracketEnd(i + 2);
      if (end === undefined) {
        end = src.indexOf("\n", i);
        if (end === -1) end = n;
      }
      out.push(blank(src.slice(i, end)));
      i = end;
    } else if (ch === '"' || ch === "'" || ch === "`") {
      let j = i + 1;
      while (j < n) {
        if (src[j] === "\\") j += 2;
        else if (src[j] === ch) {
          j++;
          break;
        } else j++;
      }
      out.push(blank(src.slice(i, j)));
      i = j;
    } else if (ch === "[" && (src[i + 1] === "[" || src[i + 1] === "=")) {
      const end = longBracketEnd(i);
      if (end === undefined) {
        out.push(ch);
        i++;
      } else {
        out.push(blank(src.slice(i, end)));
        i = end;
      }
    } else {
      out.push(ch);
      i++;
    }
  }

  return out.join("");
}

function parseGenericParams(
  src: string,
  start: number,
): { params: string[]; end: number } {
  const params: string[] = [];
  let angle = 0;
  let nest = 0;
  let current = "";
  let i = start;

  for (; i < src.length; i++) {
    const ch = src[i];

    if (ch === "<") {
      angle++;
      if (angle === 1) continue;
    } else if (ch === ">" && src[i - 1] !== "-") {
      angle--;
      if (angle === 0) {
        params.push(current);
        break;
      }
    } else if ("([{".includes(ch)) {
      nest++;
    } else if (")]}".includes(ch)) {
      nest--;
    } else if (ch === "," && angle === 1 && nest === 0) {
      params.push(current);
      current = "";
      continue;
    }

    current += ch;
  }

  return {
    params: params.map((p) => p.trim().replace(/\s+/g, " ")).filter(Boolean),
    end: i,
  };
}

export function scanExportedTypes(source: string): ExportedType[] {
  const src = stripCommentsAndStrings(source);
  const re = /\bexport\s+type\s+(function\b)?\s*([A-Za-z_][A-Za-z0-9_]*)/g;
  const found = new Map<string, ExportedType>();

  let match: RegExpExecArray | null;
  while ((match = re.exec(src)) !== null) {
    if (match[1]) continue;

    const name = match[2];
    let pos = re.lastIndex;
    while (/\s/.test(src[pos] ?? "")) pos++;

    let declParams: string[] = [];
    if (src[pos] === "<") {
      const parsed = parseGenericParams(src, pos);
      declParams = parsed.params;
      re.lastIndex = parsed.end;
    }

    const useParams = declParams.map((p) => {
      const m = /^([A-Za-z_][A-Za-z0-9_]*)(\.\.\.)?/.exec(p);
      return m ? `${m[1]}${m[2] ?? ""}` : p;
    });

    found.set(name, { name, declParams, useParams });
  }

  return [...found.values()];
}

export function findEntryFile(
  repoPath: string,
  treePath?: string,
): string | undefined {
  if (!treePath) return undefined;
  const full = path.join(repoPath, treePath);
  if (!fs.existsSync(full)) return undefined;
  if (fs.statSync(full).isFile()) return full;

  for (const name of ["init.luau", "init.lua"]) {
    const candidate = path.join(full, name);
    if (fs.existsSync(candidate)) return candidate;
  }
  return undefined;
}

export function buildTypeExports(types: ExportedType[]): string {
  return types
    .map((t) => {
      const lhs = t.declParams.length
        ? `${t.name}<${t.declParams.join(", ")}>`
        : t.name;
      const rhs = t.useParams.length
        ? `Module.${t.name}<${t.useParams.join(", ")}>`
        : `Module.${t.name}`;
      return `export type ${lhs} = ${rhs}`;
    })
    .join("\n");
}
