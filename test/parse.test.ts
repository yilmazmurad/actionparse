import { describe, expect, it } from "vitest";
import { parseFormData } from "../src/index.js";

const fd = (entries: [string, string | File][]): FormData => {
  const data = new FormData();
  for (const [k, v] of entries) data.append(k, v);
  return data;
};

describe("parseFormData", () => {
  it("parses flat fields", () => {
    expect(parseFormData(fd([["name", "Ada"], ["age", "36"]]))).toEqual({
      name: "Ada",
      age: "36",
    });
  });

  it("builds nested objects and arrays", () => {
    const result = parseFormData(
      fd([
        ["user.name", "Ada"],
        ["user[address][city]", "Izmir"],
        ["items[0].sku", "A1"],
        ["items[0].qty", "2"],
        ["items[1].sku", "B2"],
        ["tags[]", "x"],
        ["tags[]", "y"],
      ]),
    );
    expect(result).toEqual({
      user: { name: "Ada", address: { city: "Izmir" } },
      items: [
        { sku: "A1", qty: "2" },
        { sku: "B2" },
      ],
      tags: ["x", "y"],
    });
  });

  it("turns repeated keys into arrays", () => {
    expect(parseFormData(fd([["c", "1"], ["c", "2"], ["c", "3"]]))).toEqual({
      c: ["1", "2", "3"],
    });
  });

  it("forces arrays for configured names", () => {
    expect(parseFormData(fd([["roles", "admin"]]), { arrays: ["roles"] })).toEqual({
      roles: ["admin"],
    });
    expect(parseFormData(fd([["roles[]", "a"]]), { arrays: ["roles[]"] })).toEqual({
      roles: ["a"],
    });
  });

  it("compacts sparse arrays", () => {
    expect(parseFormData(fd([["a[5]", "x"], ["a[2]", "y"]]))).toEqual({
      a: ["y", "x"],
    });
  });

  it("drops empty strings by default and keeps them on request", () => {
    const data = fd([["name", ""], ["bio", "hi"]]);
    expect(parseFormData(data)).toEqual({ bio: "hi" });
    expect(parseFormData(data, { emptyStrings: "keep" })).toEqual({
      name: "",
      bio: "hi",
    });
  });

  it("skips empty file inputs by default", () => {
    const empty = new File([], "");
    const real = new File(["hello"], "a.txt", { type: "text/plain" });
    const data = fd([["avatar", empty], ["doc", real]]);
    const result = parseFormData(data);
    expect(Object.keys(result)).toEqual(["doc"]);
    expect(result.doc).toBeInstanceOf(File);
    expect((result.doc as File).name).toBe("a.txt");
    expect(Object.keys(parseFormData(data, { emptyFiles: "keep" }))).toEqual([
      "avatar",
      "doc",
    ]);
  });

  it("ignores React's internal $ACTION_ fields", () => {
    const data = fd([["$ACTION_ID_abc", ""], ["$ACTION_REF_1", "x"], ["q", "1"]]);
    expect(parseFormData(data)).toEqual({ q: "1" });
    expect(
      parseFormData(fd([["_csrf", "t"], ["q", "1"]]), { ignorePrefixes: ["_"] }),
    ).toEqual({ q: "1" });
  });

  it("ignores indexes above maxArrayIndex", () => {
    expect(parseFormData(fd([["a[1001]", "x"], ["a[0]", "y"]]))).toEqual({
      a: ["y"],
    });
    expect(parseFormData(fd([["a[3]", "x"]]), { maxArrayIndex: 2 })).toEqual({});
  });

  it("blocks prototype pollution and malformed names", () => {
    const result = parseFormData(
      fd([
        ["__proto__.polluted", "yes"],
        ["constructor[prototype][x]", "yes"],
        ["a..b", "bad"],
        ["ok", "1"],
      ]),
    );
    expect(result).toEqual({ ok: "1" });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
  });

  it("keeps the first value on scalar/container conflicts", () => {
    expect(parseFormData(fd([["a", "1"], ["a.b", "2"]]))).toEqual({ a: "1" });
    expect(parseFormData(fd([["a.b", "2"], ["a", "1"]]))).toEqual({ a: { b: "2" } });
  });

  it("accepts URLSearchParams and entry iterables", () => {
    expect(parseFormData(new URLSearchParams("a=1&b.c=2&t[]=x"))).toEqual({
      a: "1",
      b: { c: "2" },
      t: ["x"],
    });
    expect(parseFormData([["x[0]", "1"], ["x[1]", "2"]])).toEqual({ x: ["1", "2"] });
  });

  it("ignores appends to non-array nodes", () => {
    expect(parseFormData(fd([["a.b", "1"], ["a[]", "2"]]))).toEqual({ a: { b: "1" } });
  });
});
