import { describe, expect, it } from "vitest";
import { z } from "zod";
import * as v from "valibot";
import {
  flattenIssues,
  parseWithSchema,
  validate,
  type StandardSchemaV1,
} from "../src/index.js";

const zodSchema = z.object({
  email: z.string().email("Invalid email"),
  age: z.coerce.number().int().min(18, "Too young"),
  items: z.array(z.object({ qty: z.coerce.number().positive("Must be > 0") })),
  newsletter: z
    .literal("on")
    .optional()
    .transform((value) => value === "on"),
});

describe("validate", () => {
  it("returns typed data on success (zod)", async () => {
    const result = await validate(zodSchema, {
      email: "ada@example.com",
      age: "36",
      items: [{ qty: "2" }],
      newsletter: "on",
    });
    expect(result).toEqual({
      success: true,
      data: { email: "ada@example.com", age: 36, items: [{ qty: 2 }], newsletter: true },
    });
  });

  it("flattens errors to form field names (zod)", async () => {
    const result = await validate(zodSchema, {
      email: "nope",
      age: "12",
      items: [{ qty: "1" }, { qty: "0" }],
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.errors.fieldErrors).toEqual({
      email: ["Invalid email"],
      age: ["Too young"],
      "items[1].qty": ["Must be > 0"],
    });
    expect(result.issues.length).toBe(3);
  });

  it("works with valibot", async () => {
    const schema = v.object({
      name: v.pipe(v.string(), v.minLength(2, "Too short")),
      tags: v.array(v.string()),
    });
    const ok = await validate(schema, { name: "Ada", tags: ["x"] });
    expect(ok).toEqual({ success: true, data: { name: "Ada", tags: ["x"] } });
    const bad = await validate(schema, { name: "A", tags: [1] });
    expect(bad.success).toBe(false);
    if (!bad.success) {
      expect(bad.errors.fieldErrors.name).toEqual(["Too short"]);
      expect(bad.errors.fieldErrors["tags[0]"]).toHaveLength(1);
    }
  });

  it("supports async schemas and form-level errors", async () => {
    const schema: StandardSchemaV1<unknown, string> = {
      "~standard": {
        version: 1,
        vendor: "custom",
        validate: async (value) =>
          value === "ok" ? { value: "ok" } : { issues: [{ message: "Form invalid" }] },
      },
    };
    expect(await validate(schema, "ok")).toEqual({ success: true, data: "ok" });
    const bad = await validate(schema, "x");
    expect(bad.success).toBe(false);
    if (!bad.success) expect(bad.errors).toEqual({ formErrors: ["Form invalid"], fieldErrors: {} });
  });
});

describe("flattenIssues", () => {
  it("handles PathSegment objects and groups messages", () => {
    expect(
      flattenIssues([
        { message: "a", path: [{ key: "user" }, { key: "email" }] },
        { message: "b", path: ["user", "email"] },
        { message: "c", path: [] },
        { message: "d" },
        { message: "e", path: ["list", { key: 2 }] },
      ]),
    ).toEqual({
      formErrors: ["c", "d"],
      fieldErrors: { "user.email": ["a", "b"], "list[2]": ["e"] },
    });
  });
});

describe("parseWithSchema", () => {
  it("parses FormData and validates in one step", async () => {
    const data = new FormData();
    data.append("email", "ada@example.com");
    data.append("age", "40");
    data.append("items[0].qty", "3");
    data.append("$ACTION_ID_x", "");
    const result = await parseWithSchema(data, zodSchema);
    expect(result).toEqual({
      success: true,
      data: { email: "ada@example.com", age: 40, items: [{ qty: 3 }], newsletter: false },
    });
  });

  it("passes parse options through", async () => {
    const schema = z.object({ roles: z.array(z.string()) });
    const data = new FormData();
    data.append("roles", "admin");
    expect((await parseWithSchema(data, schema)).success).toBe(false);
    expect(await parseWithSchema(data, schema, { arrays: ["roles"] })).toEqual({
      success: true,
      data: { roles: ["admin"] },
    });
  });
});
