English | [Türkçe](README.tr.md)

# actionparse

[![CI](https://github.com/yilmazmurad/actionparse/actions/workflows/ci.yml/badge.svg)](https://github.com/yilmazmurad/actionparse/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**Turn `FormData` into typed, nested objects and validate them with any [Standard Schema](https://standardschema.dev) validator (Zod, Valibot, ArkType, …).** Built for React 19 form actions, `useActionState` and server actions. Zero runtime dependencies.

```ts
const signup = createFormAction(schema, async (user) => db.users.create(user));
const [state, formAction, pending] = useActionState(signup, idleState);
```

## Why?

React 19 hands your action a raw `FormData`. Every project ends up re-writing the same glue:

- turning `items[0].qty` / `address.city` / `tags[]` into nested objects,
- dropping empty strings and the empty `File` browsers send for untouched file inputs,
- ignoring React's hidden `$ACTION_*` fields,
- mapping validator issues back to **input names** so `<input name="items[0].qty">` can show its error,
- echoing submitted values so the form can be re-populated after a failed submit.

`actionparse` does exactly that, in a few hundred lines, for any validator that implements Standard Schema.

## Features

- 🧩 **Nested parsing** — dot (`a.b`), bracket (`a[b]`), index (`a[0]`, `a.0`) and append (`a[]`) notation, freely mixed
- 🔁 Repeated keys become arrays; force arrays with `arrays: ["roles"]` for single checkboxes
- 🧹 Drops empty strings and empty file inputs by default (configurable)
- 🛡️ Prototype-pollution safe (`__proto__`, `constructor`, `prototype` rejected), sparse-array DoS guard (`maxArrayIndex`)
- ✅ Works with **any Standard Schema v1** validator — sync or async — no adapters
- 🎯 Errors keyed by form field names: `{ fieldErrors: { "items[1].qty": ["Must be > 0"] }, formErrors: [] }`
- ⚛️ `createFormAction` returns a `(prevState, formData)` function ready for `useActionState`
- 🚫 `ActionError` for business errors ("email already taken") in the same shape
- 📦 ESM, fully typed, zero dependencies, tree-shakeable

## Install

```bash
npm install actionparse
# plus your validator of choice, e.g.
npm install zod
```

> Not yet published to npm — until then install from GitHub: `npm install github:yilmazmurad/actionparse` (the `prepare` script builds `dist/` automatically)

## Usage

### 1. Parse FormData

```ts
import { parseFormData } from "actionparse";

// name=Ada  address.city=Izmir  items[0].sku=A1  items[0].qty=2  tags[]=a  tags[]=b
parseFormData(formData);
// {
//   name: "Ada",
//   address: { city: "Izmir" },
//   items: [{ sku: "A1", qty: "2" }],
//   tags: ["a", "b"]
// }
```

Also accepts `URLSearchParams` and any `[name, value]` iterable.

### 2. Parse + validate

```ts
import { z } from "zod";
import { parseWithSchema } from "actionparse";

const Order = z.object({
  email: z.string().email(),
  items: z.array(z.object({ sku: z.string(), qty: z.coerce.number().positive() })),
});

const result = await parseWithSchema(formData, Order);
if (result.success) {
  result.data; // { email: string; items: { sku: string; qty: number }[] }
} else {
  result.errors.fieldErrors; // { "items[0].qty": ["Too small: expected number to be >0"] }
  result.issues;             // raw Standard Schema issues
}
```

`validate(schema, value)` and `flattenIssues(issues)` are exported too.

### 3. React 19 `useActionState`

```tsx
// actions.ts
"use server";
import { z } from "zod";
import { createFormAction, ActionError } from "actionparse";

const Signup = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "At least 8 characters"),
});

export const signup = createFormAction(Signup, async (user) => {
  if (await db.users.exists(user.email)) {
    throw new ActionError({ fieldErrors: { email: ["Email already taken"] } });
  }
  return db.users.create(user);
});
```

```tsx
// SignupForm.tsx
"use client";
import { useActionState } from "react";
import { idleState, getError } from "actionparse";
import { signup } from "./actions";

export function SignupForm() {
  const [state, formAction, pending] = useActionState(signup, idleState);
  const values = state.status === "idle" ? {} : state.values;

  return (
    <form action={formAction}>
      <input name="email" defaultValue={String(values.email ?? "")} />
      <p role="alert">{getError(state, "email")}</p>

      <input name="password" type="password" />
      <p role="alert">{getError(state, "password")}</p>

      <p role="alert">{getError(state) /* form-level error */}</p>
      <button disabled={pending}>Sign up</button>
      {state.status === "success" && <p>Welcome!</p>}
    </form>
  );
}
```

The returned state is a discriminated union:

```ts
type ActionState<T> =
  | { status: "idle" }
  | { status: "success"; data: T; values: Record<string, unknown> }
  | { status: "error"; errors: FormErrors; values: Record<string, unknown> };
```

`values` contains the parsed submission with files removed (disable with `echoValues: false`). Unexpected errors thrown by the handler are re-thrown so your error boundary handles them.

## API

| Export | Description |
| --- | --- |
| `parseFormData(input, options?)` | `FormData` / `URLSearchParams` / entries → nested plain object |
| `validate(schema, value)` | Run any Standard Schema; returns `{ success, data }` or `{ success: false, errors, issues }` |
| `parseWithSchema(input, schema, options?)` | `parseFormData` + `validate` |
| `flattenIssues(issues)` | Issues → `{ formErrors, fieldErrors }` keyed by field name |
| `createFormAction(schema, handler, options?)` | `(prevState, formData) => Promise<ActionState>` |
| `ActionError` | Throw from a handler: `new ActionError("msg")` or `new ActionError({ fieldErrors, formErrors })` |
| `idleState` | Frozen `{ status: "idle" }` initial state |
| `getError(state, name?)` / `getErrors(state, name)` | Read first / all errors for a field (no name → form-level) |
| `parsePath(name)` / `formatPath(path)` | Low-level name ⇄ path helpers |

### Parse options

| Option | Default | Description |
| --- | --- | --- |
| `emptyStrings` | `"undefined"` | `"undefined"` drops `""`, `"keep"` keeps it |
| `emptyFiles` | `"skip"` | Drop the empty `File` sent for untouched file inputs |
| `arrays` | `[]` | Field names that always become arrays |
| `ignorePrefixes` | `["$ACTION_"]` | Field name prefixes to ignore |
| `maxArrayIndex` | `1000` | Entries with a larger index are ignored |

Values stay strings (or `File`s) — use your schema to coerce (`z.coerce.number()`, `v.pipe(v.string(), v.transform(Number))`, …). Sparse arrays are compacted, and on conflicts like `a=1` + `a.b=2` the first entry wins.

## Development

```bash
npm install
npm test               # vitest
npm run test:coverage  # coverage report (100% lines)
npm run typecheck      # tsc --noEmit
npm run lint           # eslint
npm run build          # emits dist/
npm run check          # all of the above
```

## License

[MIT](LICENSE) © Murat Yılmaz
