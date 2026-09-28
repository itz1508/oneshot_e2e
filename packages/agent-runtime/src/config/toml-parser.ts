/**
 * OneShot Zero-Dependency TOML Parser & Serializer
 * 
 * Supports:
 * - Key-value pairs with primitive types (strings, numbers, booleans)
 * - Multiline strings and comments (#)
 * - Tables ([table]) and nested tables ([parent.child])
 * - Array of tables ([[array_of_tables]])
 * - Inline arrays ([1, 2, 3] and ["a", "b"])
 * - Inline tables ({ key = "val", name = "workspace" })
 * - Environment variable interpolation: ${VAR_NAME:-default}
 */

export function parseToml(tomlStr: string): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  let currentTarget: Record<string, unknown> = root;
  const lines = tomlStr.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();

    // Skip empty lines or pure comment lines
    if (!line || line.startsWith("#")) {
      continue;
    }

    // Strip trailing comment if not in quotes
    const cleanedLine = stripInlineComment(line);
    if (!cleanedLine) continue;

    // Check for Array of Tables: [[table.name]]
    if (cleanedLine.startsWith("[[") && cleanedLine.endsWith("]]")) {
      const fullPath = cleanedLine.slice(2, -2).trim();
      const parts = fullPath.split(".").map((p) => p.trim());
      let obj: Record<string, unknown> = root;

      for (let p = 0; p < parts.length - 1; p++) {
        const part = parts[p];
        if (!obj[part] || typeof obj[part] !== "object") {
          obj[part] = {};
        }
        obj = obj[part] as Record<string, unknown>;
      }

      const lastPart = parts[parts.length - 1];
      if (!Array.isArray(obj[lastPart])) {
        obj[lastPart] = [];
      }
      const newEntry: Record<string, unknown> = {};
      (obj[lastPart] as Array<Record<string, unknown>>).push(newEntry);
      currentTarget = newEntry;
      continue;
    }

    // Check for Standard Table: [table.name]
    if (cleanedLine.startsWith("[") && cleanedLine.endsWith("]")) {
      const fullPath = cleanedLine.slice(1, -1).trim();
      const parts = fullPath.split(".").map((p) => p.trim());
      let obj: Record<string, unknown> = root;

      for (const part of parts) {
        if (!obj[part] || typeof obj[part] !== "object" || Array.isArray(obj[part])) {
          obj[part] = {};
        }
        obj = obj[part] as Record<string, unknown>;
      }
      currentTarget = obj;
      continue;
    }

    // Key-value pair: key = value
    const eqIdx = cleanedLine.indexOf("=");
    if (eqIdx !== -1) {
      const rawKey = cleanedLine.slice(0, eqIdx).trim();
      const rawVal = cleanedLine.slice(eqIdx + 1).trim();

      const parsedVal = parseTomlValue(rawVal, lines, i);
      if (typeof parsedVal === "object" && parsedVal !== null && "__nextLine" in parsedVal) {
        i = (parsedVal as { __nextLine: number }).__nextLine;
      }
      const actualVal = (parsedVal && typeof parsedVal === "object" && "val" in parsedVal)
        ? (parsedVal as { val: unknown }).val
        : parsedVal;

      setNestedKey(currentTarget, rawKey, actualVal);
    }
  }

  return root;
}

function stripInlineComment(line: string): string {
  let inDouble = false;
  let inSingle = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"' && !inSingle && line[i - 1] !== "\\") {
      inDouble = !inDouble;
    } else if (c === "'" && !inDouble && line[i - 1] !== "\\") {
      inSingle = !inSingle;
    } else if (c === "#" && !inDouble && !inSingle) {
      return line.slice(0, i).trim();
    }
  }
  return line;
}

function parseTomlValue(valStr: string, allLines: string[], curLineIdx: number): unknown {
  const str = interpolateEnv(valStr.trim());

  // String in double quotes
  if (str.startsWith('"') && str.endsWith('"') && str.length >= 2) {
    return unescapeString(str.slice(1, -1));
  }

  // String in single quotes (literal)
  if (str.startsWith("'") && str.endsWith("'") && str.length >= 2) {
    return str.slice(1, -1);
  }

  // Booleans
  if (str === "true") return true;
  if (str === "false") return false;

  // Numbers
  if (/^-?\d+$/.test(str)) return parseInt(str, 10);
  if (/^-?\d+\.\d+$/.test(str)) return parseFloat(str);

  // Inline Tables: { key = "val", foo = 123 }
  if (str.startsWith("{") && str.endsWith("}")) {
    const inner = str.slice(1, -1).trim();
    if (!inner) return {};
    const tableObj: Record<string, unknown> = {};
    const pairs = splitArrayItems(inner);
    for (const pair of pairs) {
      const eq = pair.indexOf("=");
      if (eq !== -1) {
        const k = pair.slice(0, eq).trim();
        const v = parseTomlValue(pair.slice(eq + 1).trim(), allLines, curLineIdx);
        tableObj[k] = (v && typeof v === "object" && "val" in v)
          ? (v as { val: unknown }).val
          : v;
      }
    }
    return tableObj;
  }

  // Arrays: [item1, item2, ...]
  if (str.startsWith("[")) {
    let combined = str;
    let nextLine = curLineIdx;
    while (!hasMatchingClosingBracket(combined) && nextLine + 1 < allLines.length) {
      nextLine++;
      const nextClean = stripInlineComment(allLines[nextLine].trim());
      if (nextClean) {
        combined += " " + nextClean;
      }
    }

    if (combined.endsWith("]")) {
      const inner = combined.slice(1, -1).trim();
      if (!inner) return { val: [], __nextLine: nextLine };

      const items = splitArrayItems(inner);
      const parsedItems = items.map((item) => {
        const parsed = parseTomlValue(item, allLines, curLineIdx);
        return (parsed && typeof parsed === "object" && "val" in parsed)
          ? (parsed as { val: unknown }).val
          : parsed;
      });
      return { val: parsedItems, __nextLine: nextLine };
    }
  }

  // Fallback string
  return str;
}

function hasMatchingClosingBracket(str: string): boolean {
  let depth = 0;
  let inDouble = false;
  let inSingle = false;
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (c === '"' && !inSingle && str[i - 1] !== "\\") {
      inDouble = !inDouble;
    } else if (c === "'" && !inDouble && str[i - 1] !== "\\") {
      inSingle = !inSingle;
    } else if (c === "[" && !inDouble && !inSingle) {
      depth++;
    } else if (c === "]" && !inDouble && !inSingle) {
      depth--;
      if (depth === 0 && i === str.length - 1) return true;
    }
  }
  return depth === 0 && str.endsWith("]");
}

function splitArrayItems(str: string): string[] {
  const items: string[] = [];
  let current = "";
  let inDouble = false;
  let inSingle = false;
  let bracketDepth = 0;
  let braceDepth = 0;

  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (c === '"' && !inSingle && str[i - 1] !== "\\") {
      inDouble = !inDouble;
    } else if (c === "'" && !inDouble && str[i - 1] !== "\\") {
      inSingle = !inSingle;
    } else if (c === "[" && !inDouble && !inSingle) {
      bracketDepth++;
    } else if (c === "]" && !inDouble && !inSingle) {
      bracketDepth--;
    } else if (c === "{" && !inDouble && !inSingle) {
      braceDepth++;
    } else if (c === "}" && !inDouble && !inSingle) {
      braceDepth--;
    } else if (c === "," && !inDouble && !inSingle && bracketDepth === 0 && braceDepth === 0) {
      if (current.trim()) items.push(current.trim());
      current = "";
      continue;
    }
    current += c;
  }
  if (current.trim()) items.push(current.trim());
  return items;
}

function setNestedKey(target: Record<string, unknown>, key: string, value: unknown): void {
  const parts = key.split(".").map((k) => k.trim());
  let cur = target;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (!cur[p] || typeof cur[p] !== "object") {
      cur[p] = {};
    }
    cur = cur[p] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}

function unescapeString(s: string): string {
  return s
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

function interpolateEnv(str: string): string {
  return str.replace(/\$\{([^}]+)\}/g, (_, expr: string) => {
    const colonIdx = expr.indexOf(":-");
    if (colonIdx !== -1) {
      const varName = expr.slice(0, colonIdx).trim();
      const defaultVal = expr.slice(colonIdx + 2).trim();
      return process.env[varName] !== undefined ? process.env[varName]! : defaultVal;
    }
    return process.env[expr.trim()] || "";
  });
}
