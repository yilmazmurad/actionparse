import { describe, expect, it } from "vitest";
import { formatPath, parsePath } from "../src/index.js";

describe("parsePath", () => {
  it.each([
    ["name", ["name"]],
    ["user.address.city", ["user", "address", "city"]],
    ["user[address][city]", ["user", "address", "city"]],
    ["items[0].qty", ["items", 0, "qty"]],
    ["items.0.qty", ["items", 0, "qty"]],
    ["tags[]", ["tags", null]],
    ["a[b].c[2]", ["a", "b", "c", 2]],
    ["matrix[1][2]", ["matrix", 1, 2]],
    ["zip01", ["zip01"]],
    ["a.01", ["a", "01"]],
  ])("parses %s", (input, expected) => {
    expect(parsePath(input)).toEqual(expected);
  });

  it.each([
    "",
    ".a",
    "a.",
    "a..b",
    "[0]",
    "a[0",
    "a]",
    "a[0]b",
    "tags[].x",
    "__proto__.polluted",
    "a.constructor.prototype",
    "a[__proto__]",
  ])("rejects %j", (input) => {
    expect(parsePath(input)).toBeNull();
  });
});

describe("formatPath", () => {
  it("formats paths in form notation", () => {
    expect(formatPath(["items", 0, "qty"])).toBe("items[0].qty");
    expect(formatPath(["user", "email"])).toBe("user.email");
    expect(formatPath([0])).toBe("[0]");
    expect(formatPath([])).toBe("");
  });

  it("round-trips with parsePath", () => {
    const name = "order.items[3].options[0].label";
    expect(formatPath(parsePath(name) as (string | number)[])).toBe(name);
  });
});
