/** A single segment of a parsed field path. `null` means "append" (`tags[]`). */
export type PathKey = string | number | null;

const FORBIDDEN = new Set(["__proto__", "prototype", "constructor"]);
const INDEX = /^(0|[1-9]\d*)$/;

/**
 * Parses a form field name into path segments.
 *
 * Supported notations (can be mixed):
 * - dot:      `user.address.city`
 * - bracket:  `user[address][city]`
 * - index:    `items[0].qty`, `items.0.qty`
 * - append:   `tags[]`
 *
 * Returns `null` for malformed or unsafe names (prototype pollution keys).
 */
export function parsePath(name: string): PathKey[] | null {
  if (name === "") return null;
  const keys: PathKey[] = [];
  let i = 0;
  let current = "";
  let expectSegment = true;

  const pushCurrent = (): boolean => {
    if (current === "") return false;
    keys.push(toKey(current));
    current = "";
    return true;
  };

  while (i < name.length) {
    const ch = name.charAt(i);
    if (ch === ".") {
      if (!pushCurrent() && expectSegment) return null;
      expectSegment = true;
      i++;
    } else if (ch === "[") {
      if (current === "" && keys.length === 0) return null;
      pushCurrent();
      const end = name.indexOf("]", i);
      if (end === -1) return null;
      const inner = name.slice(i + 1, end);
      keys.push(inner === "" ? null : toKey(inner));
      i = end + 1;
      expectSegment = false;
      // after `]` only `.`, `[` or end is allowed
      if (i < name.length && name[i] !== "." && name[i] !== "[") return null;
    } else if (ch === "]") {
      return null;
    } else {
      current += ch;
      expectSegment = false;
      i++;
    }
  }
  if (current !== "") keys.push(toKey(current));
  else if (expectSegment) return null;

  for (const key of keys) {
    if (typeof key === "string" && FORBIDDEN.has(key)) return null;
  }
  // `[]` (append) is only allowed as the last segment
  const appendAt = keys.indexOf(null);
  if (appendAt !== -1 && appendAt !== keys.length - 1) return null;
  return keys;
}

function toKey(segment: string): string | number {
  return INDEX.test(segment) ? Number(segment) : segment;
}

/**
 * Formats a validation issue path back into form-field notation,
 * e.g. `["items", 0, "qty"]` → `"items[0].qty"`.
 */
export function formatPath(path: ReadonlyArray<PropertyKey>): string {
  let out = "";
  for (const key of path) {
    if (typeof key === "number") out += `[${key}]`;
    else {
      const str = String(key);
      out += out === "" ? str : `.${str}`;
    }
  }
  return out;
}
