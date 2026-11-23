[English](README.md) | Türkçe

# actionparse

[![CI](https://github.com/yilmazmurad/actionparse/actions/workflows/ci.yml/badge.svg)](https://github.com/yilmazmurad/actionparse/actions/workflows/ci.yml)
[![Lisans: MIT](https://img.shields.io/badge/Lisans-MIT-blue.svg)](LICENSE)

**`FormData`'yı tipli, iç içe nesnelere dönüştürür ve herhangi bir [Standard Schema](https://standardschema.dev) doğrulayıcısıyla (Zod, Valibot, ArkType, …) doğrular.** React 19 form action'ları, `useActionState` ve server action'lar için tasarlandı. Çalışma zamanı bağımlılığı yoktur.

```ts
const signup = createFormAction(schema, async (user) => db.users.create(user));
const [state, formAction, pending] = useActionState(signup, idleState);
```

## Neden?

React 19, action'ınıza ham bir `FormData` verir. Her projede aynı yapıştırıcı kod tekrar yazılır:

- `items[0].qty` / `address.city` / `tags[]` alanlarını iç içe nesnelere çevirmek,
- boş string'leri ve dokunulmamış dosya input'ları için tarayıcının gönderdiği boş `File`'ı atmak,
- React'in gizli `$ACTION_*` alanlarını yok saymak,
- doğrulayıcı hatalarını **input adlarına** geri eşlemek (`<input name="items[0].qty">` kendi hatasını gösterebilsin),
- başarısız gönderimden sonra formu yeniden doldurmak için gönderilen değerleri geri döndürmek.

`actionparse`, Standard Schema destekleyen her doğrulayıcı için tam olarak bunu birkaç yüz satırda yapar.

## Özellikler

- 🧩 **İç içe ayrıştırma** — nokta (`a.b`), köşeli parantez (`a[b]`), indeks (`a[0]`, `a.0`) ve ekleme (`a[]`) notasyonu, karışık kullanılabilir
- 🔁 Tekrarlanan anahtarlar diziye dönüşür; tek checkbox için `arrays: ["roles"]` ile dizi zorlanabilir
- 🧹 Varsayılan olarak boş string'leri ve boş dosya input'larını atar (ayarlanabilir)
- 🛡️ Prototype pollution'a karşı güvenli (`__proto__`, `constructor`, `prototype` reddedilir), seyrek dizi DoS koruması (`maxArrayIndex`)
- ✅ **Her Standard Schema v1** doğrulayıcısıyla çalışır — senkron veya asenkron — adaptör gerekmez
- 🎯 Hatalar form alan adlarıyla anahtarlanır: `{ fieldErrors: { "items[1].qty": ["0'dan büyük olmalı"] }, formErrors: [] }`
- ⚛️ `createFormAction`, `useActionState` için hazır bir `(prevState, formData)` fonksiyonu döndürür
- 🚫 İş kuralı hataları ("e-posta zaten kayıtlı") için aynı formatta `ActionError`
- 📦 ESM, tam tipli, sıfır bağımlılık, tree-shake edilebilir

## Kurulum

```bash
npm install actionparse
# ve tercih ettiğiniz doğrulayıcı, örn.
npm install zod
```

> Henüz npm'de yayınlanmadı — o zamana kadar GitHub'dan kurun: `npm install github:yilmazmurad/actionparse`

## Kullanım

### 1. FormData ayrıştırma

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

`URLSearchParams` ve herhangi bir `[ad, değer]` iterable'ı da kabul edilir.

### 2. Ayrıştır + doğrula

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
  result.errors.fieldErrors; // { "items[0].qty": ["..."] }
  result.issues;             // ham Standard Schema issue'ları
}
```

`validate(schema, value)` ve `flattenIssues(issues)` da dışa aktarılır.

### 3. React 19 `useActionState`

```tsx
// actions.ts
"use server";
import { z } from "zod";
import { createFormAction, ActionError } from "actionparse";

const Signup = z.object({
  email: z.string().email("Geçerli bir e-posta girin"),
  password: z.string().min(8, "En az 8 karakter"),
});

export const signup = createFormAction(Signup, async (user) => {
  if (await db.users.exists(user.email)) {
    throw new ActionError({ fieldErrors: { email: ["Bu e-posta zaten kayıtlı"] } });
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

      <p role="alert">{getError(state) /* form seviyesi hata */}</p>
      <button disabled={pending}>Kayıt ol</button>
      {state.status === "success" && <p>Hoş geldiniz!</p>}
    </form>
  );
}
```

Dönen state ayrık bir union tipidir:

```ts
type ActionState<T> =
  | { status: "idle" }
  | { status: "success"; data: T; values: Record<string, unknown> }
  | { status: "error"; errors: FormErrors; values: Record<string, unknown> };
```

`values`, dosyalar çıkarılmış ayrıştırılmış gönderimi içerir (`echoValues: false` ile kapatılabilir). Handler'ın fırlattığı beklenmeyen hatalar yeniden fırlatılır; böylece error boundary'niz bunları yakalar.

## API

| Dışa aktarım | Açıklama |
| --- | --- |
| `parseFormData(input, options?)` | `FormData` / `URLSearchParams` / girdiler → iç içe düz nesne |
| `validate(schema, value)` | Herhangi bir Standard Schema'yı çalıştırır; `{ success, data }` veya `{ success: false, errors, issues }` döner |
| `parseWithSchema(input, schema, options?)` | `parseFormData` + `validate` |
| `flattenIssues(issues)` | Issue'lar → alan adıyla anahtarlanmış `{ formErrors, fieldErrors }` |
| `createFormAction(schema, handler, options?)` | `(prevState, formData) => Promise<ActionState>` |
| `ActionError` | Handler'dan fırlatın: `new ActionError("mesaj")` veya `new ActionError({ fieldErrors, formErrors })` |
| `idleState` | Dondurulmuş `{ status: "idle" }` başlangıç state'i |
| `getError(state, name?)` / `getErrors(state, name)` | Bir alanın ilk / tüm hatalarını okur (ad yoksa → form seviyesi) |
| `parsePath(name)` / `formatPath(path)` | Düşük seviye ad ⇄ yol yardımcıları |

### Ayrıştırma seçenekleri

| Seçenek | Varsayılan | Açıklama |
| --- | --- | --- |
| `emptyStrings` | `"undefined"` | `"undefined"` boş string'i atar, `"keep"` tutar |
| `emptyFiles` | `"skip"` | Dokunulmamış dosya input'larının boş `File`'ını atar |
| `arrays` | `[]` | Her zaman dizi olacak alan adları |
| `ignorePrefixes` | `["$ACTION_"]` | Yok sayılacak alan adı önekleri |
| `maxArrayIndex` | `1000` | Daha büyük indeksli girdiler yok sayılır |

Değerler string (veya `File`) olarak kalır — dönüştürme için şemanızı kullanın (`z.coerce.number()`, `v.pipe(v.string(), v.transform(Number))`, …). Seyrek diziler sıkıştırılır; `a=1` + `a.b=2` gibi çakışmalarda ilk girdi kazanır.

## Geliştirme

```bash
npm install
npm test               # vitest
npm run test:coverage  # kapsam raporu (%100 satır)
npm run typecheck      # tsc --noEmit
npm run lint           # eslint
npm run build          # dist/ üretir
npm run check          # hepsi
```

## Lisans

[MIT](LICENSE) © Murat Yılmaz
