import type { StandardSchemaV1 } from "./standard-schema.js";
import { formatPath } from "./path.js";
import { parseFormData, type FormInput, type ParseOptions } from "./parse.js";

/** Errors grouped the way forms need them. */
export interface FormErrors {
  /** Errors without a path (whole-form / refinement errors). */
  formErrors: string[];
  /** Errors keyed by field name in form notation, e.g. `items[0].qty`. */
  fieldErrors: Record<string, string[]>;
}

export type ValidationResult<T> =
  | { success: true; data: T }
  | {
      success: false;
      errors: FormErrors;
      issues: ReadonlyArray<StandardSchemaV1.Issue>;
    };

/** Converts Standard Schema issues into `{ formErrors, fieldErrors }`. */
export function flattenIssues(
  issues: ReadonlyArray<StandardSchemaV1.Issue>,
): FormErrors {
  const errors: FormErrors = { formErrors: [], fieldErrors: {} };
  for (const issue of issues) {
    const path = (issue.path ?? []).map((segment) =>
      typeof segment === "object" && segment !== null && "key" in segment
        ? segment.key
        : segment,
    );
    if (path.length === 0) {
      errors.formErrors.push(issue.message);
      continue;
    }
    const key = formatPath(path);
    (errors.fieldErrors[key] ??= []).push(issue.message);
  }
  return errors;
}

/** Validates any value against a Standard Schema (Zod, Valibot, ArkType, …). */
export async function validate<S extends StandardSchemaV1>(
  schema: S,
  value: unknown,
): Promise<ValidationResult<StandardSchemaV1.InferOutput<S>>> {
  let result = schema["~standard"].validate(value);
  if (result instanceof Promise) result = await result;
  if (result.issues) {
    return {
      success: false,
      errors: flattenIssues(result.issues),
      issues: result.issues,
    };
  }
  return {
    success: true,
    data: (result as StandardSchemaV1.SuccessResult<unknown>)
      .value as StandardSchemaV1.InferOutput<S>,
  };
}

/** `parseFormData` + `validate` in one call. */
export function parseWithSchema<S extends StandardSchemaV1>(
  input: FormInput,
  schema: S,
  options?: ParseOptions,
): Promise<ValidationResult<StandardSchemaV1.InferOutput<S>>> {
  return validate(schema, parseFormData(input, options));
}
