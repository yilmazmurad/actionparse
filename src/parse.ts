import { parsePath, type PathKey } from "./path.js";

export type FormValue = string | File;

export type FormInput =
  | FormData
  | URLSearchParams
  | Iterable<readonly [string, FormValue]>;

export interface ParseOptions {
  /**
   * What to do with empty strings (`""`).
   * - `"undefined"` (default): drop them so optional schema fields work.
   * - `"keep"`: keep them as `""`.
   */
  emptyStrings?: "undefined" | "keep";
  /**
   * What to do with empty file inputs (browsers submit a `File` with
   * `name === ""` and `size === 0` when nothing was selected).
   * - `"skip"` (default): drop them.
   * - `"keep"`: keep them.
   */
  emptyFiles?: "skip" | "keep";
  /**
   * Field names that should always produce an array, even with a single
   * value (useful for checkbox groups / multi-selects without `[]`).
   */
  arrays?: readonly string[];
  /**
   * Field name prefixes to ignore. Defaults to `["$ACTION_"]`, the hidden
   * fields React injects for server actions.
   */
  ignorePrefixes?: readonly string[];
  /**
   * Highest numeric index accepted in names like `items[5]`. Entries above
   * this limit are ignored to prevent huge sparse arrays. Default `1000`.
   */
  maxArrayIndex?: number;
}

type Container = Record<string, unknown> | unknown[];

const isFile = (value: unknown): value is File =>
  typeof File !== "undefined" && value instanceof File;

const isContainer = (value: unknown): value is Container =>
  typeof value === "object" && value !== null && !isFile(value);

function entriesOf(input: FormInput): Iterable<readonly [string, FormValue]> {
  if (input instanceof URLSearchParams) return input.entries();
  if (typeof FormData !== "undefined" && input instanceof FormData) {
    return input.entries() as Iterable<[string, FormValue]>;
  }
  return input as Iterable<readonly [string, FormValue]>;
}

/**
 * Converts `FormData` (or `URLSearchParams` / entry list) into a plain,
 * nested JavaScript object.
 *
 * @example
 * parseFormData(fd)
 * // name=Ada&tags[]=a&tags[]=b&address.city=Izmir&items[0].qty=2
 * // → { name: "Ada", tags: ["a","b"], address: { city: "Izmir" }, items: [{ qty: "2" }] }
 */
export function parseFormData(
  input: FormInput,
  options: ParseOptions = {},
): Record<string, unknown> {
  const {
    emptyStrings = "undefined",
    emptyFiles = "skip",
    arrays = [],
    ignorePrefixes = ["$ACTION_"],
    maxArrayIndex = 1000,
  } = options;
  const forcedArrays = new Set(arrays);
  const root: Record<string, unknown> = Object.create(null) as Record<
    string,
    unknown
  >;

  for (const [name, value] of entriesOf(input)) {
    if (ignorePrefixes.some((prefix) => name.startsWith(prefix))) continue;
    if (value === "" && emptyStrings === "undefined") continue;
    if (
      emptyFiles === "skip" &&
      isFile(value) &&
      value.size === 0 &&
      value.name === ""
    ) {
      continue;
    }

    const path = parsePath(name);
    if (!path) continue;
    if (
      path.some((key) => typeof key === "number" && key > maxArrayIndex)
    ) {
      continue;
    }
    if (forcedArrays.has(name) && path[path.length - 1] !== null) {
      path.push(null);
    }
    assign(root, path, value);
  }

  return toPlain(root) as Record<string, unknown>;
}

function assign(root: Container, path: PathKey[], value: FormValue): void {
  let node: Container = root;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i] as string | number;
    const nextKey = path[i + 1];
    const parent = node as Record<string | number, unknown>;
    let child = parent[key];
    if (child === undefined) {
      child =
        typeof nextKey === "number" || nextKey === null
          ? []
          : (Object.create(null) as Record<string, unknown>);
      parent[key] = child;
    }
    if (!isContainer(child)) return; // conflict: `a=1` then `a.b=2` → first wins
    node = child;
  }

  const last = path[path.length - 1] as PathKey;
  if (last === null) {
    if (Array.isArray(node)) node.push(value);
    return;
  }
  const target = node as Record<string | number, unknown>;
  const existing = target[last];
  if (existing === undefined) {
    target[last] = value;
  } else if (Array.isArray(existing)) {
    existing.push(value);
  } else if (!isContainer(existing)) {
    target[last] = [existing, value]; // repeated key → array
  }
}

/** Compacts sparse arrays and converts null-prototype objects to plain ones. */
function toPlain(value: unknown): unknown {
  if (Array.isArray(value)) {
    const out: unknown[] = [];
    for (const item of value) {
      if (item !== undefined) out.push(toPlain(item));
    }
    return out;
  }
  if (isContainer(value)) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
      out[key] = toPlain((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}
