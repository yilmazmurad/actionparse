import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  ActionError,
  createFormAction,
  getError,
  getErrors,
  idleState,
  type ActionState,
} from "../src/index.js";

const schema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(8, "Min 8 chars"),
});

const form = (entries: Record<string, string | File>): FormData => {
  const data = new FormData();
  for (const [k, v] of Object.entries(entries)) data.append(k, v);
  return data;
};

describe("createFormAction", () => {
  it("calls the handler with validated data and returns success", async () => {
    const handler = vi.fn(async (data: { email: string }) => ({ id: 7, email: data.email }));
    const action = createFormAction(schema, handler);
    const data = form({ email: "ada@example.com", password: "secret123" });
    const state = await action(idleState, data);
    expect(handler).toHaveBeenCalledWith(
      { email: "ada@example.com", password: "secret123" },
      data,
    );
    expect(state).toEqual({
      status: "success",
      data: { id: 7, email: "ada@example.com" },
      values: { email: "ada@example.com", password: "secret123" },
    });
  });

  it("returns validation errors and echoes values without calling handler", async () => {
    const handler = vi.fn();
    const action = createFormAction(schema, handler);
    const state = await action(undefined, form({ email: "bad", password: "123" }));
    expect(handler).not.toHaveBeenCalled();
    expect(state).toEqual({
      status: "error",
      errors: {
        formErrors: [],
        fieldErrors: { email: ["Invalid email"], password: ["Min 8 chars"] },
      },
      values: { email: "bad", password: "123" },
    });
  });

  it("maps thrown ActionError to error state", async () => {
    const action = createFormAction(schema, () => {
      throw new ActionError({ fieldErrors: { email: ["Email already taken"] } });
    });
    const state = await action(idleState, form({ email: "ada@example.com", password: "secret123" }));
    expect(getError(state, "email")).toBe("Email already taken");
    expect(getError(state)).toBeUndefined();
  });

  it("rethrows unexpected errors", async () => {
    const action = createFormAction(schema, () => {
      throw new Error("db down");
    });
    await expect(
      action(idleState, form({ email: "ada@example.com", password: "secret123" })),
    ).rejects.toThrow("db down");
  });

  it("strips files from echoed values and can disable echo", async () => {
    const fileSchema = z.object({ title: z.string(), attachments: z.array(z.instanceof(File)) });
    const data = new FormData();
    data.append("title", "Report");
    data.append("attachments[]", new File(["x"], "a.txt"));
    data.append("meta.tags[]", "q");
    const action = createFormAction(fileSchema.passthrough(), (d) => d.attachments.length);
    const state = await action(idleState, data);
    expect(state).toEqual({
      status: "success",
      data: 1,
      values: { title: "Report", attachments: [], meta: { tags: ["q"] } },
    });
    const silent = createFormAction(fileSchema.passthrough(), () => null, { echoValues: false });
    expect(await silent(idleState, data)).toMatchObject({ values: {} });
  });
});

describe("ActionError", () => {
  it("accepts a string as a form error", () => {
    const err = new ActionError("Something went wrong");
    expect(err.message).toBe("Something went wrong");
    expect(err.name).toBe("ActionError");
    expect(err.errors).toEqual({ formErrors: ["Something went wrong"], fieldErrors: {} });
  });

  it("derives a message from field errors or falls back", () => {
    expect(new ActionError({ fieldErrors: { a: ["bad a"] } }).message).toBe("bad a");
    expect(new ActionError({}).message).toBe("Action failed");
  });
});

describe("getError / getErrors", () => {
  const state: ActionState = {
    status: "error",
    errors: { formErrors: ["Oops"], fieldErrors: { name: ["Required", "Too short"] } },
    values: {},
  };

  it("reads errors from an error state", () => {
    expect(getError(state)).toBe("Oops");
    expect(getError(state, "name")).toBe("Required");
    expect(getErrors(state, "name")).toEqual(["Required", "Too short"]);
    expect(getErrors(state, "missing")).toEqual([]);
  });

  it("returns empty results for non-error states", () => {
    expect(getError(idleState, "name")).toBeUndefined();
    expect(getError(undefined)).toBeUndefined();
    expect(getErrors(idleState, "name")).toEqual([]);
    expect(getErrors(undefined, "name")).toEqual([]);
  });

  it("idleState is frozen", () => {
    expect(Object.isFrozen(idleState)).toBe(true);
  });
});
