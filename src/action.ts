import type { StandardSchemaV1 } from "./standard-schema.js";
import { parseFormData, type ParseOptions } from "./parse.js";
import { validate, type FormErrors } from "./validate.js";

/** Submitted values echoed back so inputs can be re-populated (files removed). */
export type SubmittedValues = Record<string, unknown>;

export type ActionState<TResult = unknown> =
  | { status: "idle" }
  | { status: "success"; data: TResult; values: SubmittedValues }
  | { status: "error"; errors: FormErrors; values: SubmittedValues };

/** Initial state to pass to React's `useActionState`. */
export const idleState: ActionState<never> = Object.freeze({
  status: "idle",
}) as ActionState<never>;

/**
 * Throw from an action handler to report business-logic errors
 * (e.g. "email already taken") through the same error shape as
 * validation errors.
 */
export class ActionError extends Error {
  readonly errors: FormErrors;

  constructor(
    errors:
      | string
      | { formErrors?: string[]; fieldErrors?: Record<string, string[]> },
  ) {
    const normalized: FormErrors =
      typeof errors === "string"
        ? { formErrors: [errors], fieldErrors: {} }
        : {
            formErrors: errors.formErrors ?? [],
            fieldErrors: errors.fieldErrors ?? {},
          };
    super(
      normalized.formErrors[0] ??
        Object.values(normalized.fieldErrors)[0]?.[0] ??
        "Action failed",
    );
    this.name = "ActionError";
    this.errors = normalized;
  }
}

export interface FormActionOptions extends ParseOptions {
  /** Echo submitted values back in the state. Default `true`. */
  echoValues?: boolean;
}

/**
 * Creates a `(prevState, formData) => Promise<ActionState>` function that is
 * directly usable with React 19 `useActionState` or as a server action.
 *
 * @example
 * const signup = createFormAction(schema, async (data) => {
 *   await db.users.insert(data);
 *   return { id: 1 };
 * });
 * const [state, formAction, pending] = useActionState(signup, idleState);
 */
export function createFormAction<S extends StandardSchemaV1, TResult>(
  schema: S,
  handler: (
    data: StandardSchemaV1.InferOutput<S>,
    formData: FormData,
  ) => TResult | Promise<TResult>,
  options: FormActionOptions = {},
): (
  prevState: ActionState<Awaited<TResult>> | undefined,
  formData: FormData,
) => Promise<ActionState<Awaited<TResult>>> {
  const { echoValues = true, ...parseOptions } = options;

  return async (_prevState, formData) => {
    const raw = parseFormData(formData, parseOptions);
    const values = echoValues ? stripFiles(raw) : {};
    const result = await validate(schema, raw);
    if (!result.success) {
      return { status: "error", errors: result.errors, values };
    }
    try {
      const data = await handler(result.data, formData);
      return { status: "success", data, values };
    } catch (error) {
      if (error instanceof ActionError) {
        return { status: "error", errors: error.errors, values };
      }
      throw error;
    }
  };
}

/** Returns the first error message for a field (or form-level if no name). */
export function getError(
  state: ActionState<unknown> | undefined,
  name?: string,
): string | undefined {
  if (!state || state.status !== "error") return undefined;
  if (name === undefined) return state.errors.formErrors[0];
  return state.errors.fieldErrors[name]?.[0];
}

/** Returns all error messages for a field. */
export function getErrors(
  state: ActionState<unknown> | undefined,
  name: string,
): string[] {
  if (!state || state.status !== "error") return [];
  return state.errors.fieldErrors[name] ?? [];
}

function stripFiles(value: unknown): SubmittedValues {
  return strip(value) as SubmittedValues;
}

function strip(value: unknown): unknown {
  if (typeof File !== "undefined" && value instanceof File) return undefined;
  if (Array.isArray(value)) {
    return value.map(strip).filter((item) => item !== undefined);
  }
  if (typeof value === "object" && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      const stripped = strip(item);
      if (stripped !== undefined) out[key] = stripped;
    }
    return out;
  }
  return value;
}
