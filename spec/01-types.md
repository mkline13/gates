# Typed Application Boundary — Type System MVP Specification

## 1. Purpose

The type system defines the contracts used by the application boundary.

Its primary responsibilities are:

1. Define schemas for application values.
2. Provide a corresponding TypeScript type for each schema.
3. Provide a runtime validator for each schema.
4. Provide machine-readable inspection of each schema.
5. Allow schemas to be used as input and output contracts by the application runtime.

The central invariant is:

> Every protocol type definition produces a runtime type descriptor from which both runtime validation behavior and the corresponding TypeScript value type are derived.

The type system therefore connects compile-time type safety with runtime boundary validation.

## 2. Design Constraints

### 2.1 Every type has both compile-time and runtime representations

When a developer defines a protocol type, the system must make both of the following available:

* a TypeScript type usable by application code
* a runtime contract usable for validation

For example:

```ts
const User = struct({
  name: string(),
  email: string()
})

type User = Infer<typeof User>
```

`User` is a runtime type descriptor.

`Infer<typeof User>` is the corresponding TypeScript value type.

The exact API is subject to implementation, but this relationship is fundamental to the design.

### 2.2 Static and runtime semantics must correspond

The TypeScript type and runtime validator must represent the same schema.

The system must not allow a situation where the compiler considers a value valid but the runtime validator rejects it, or vice versa, except where the limitations of TypeScript's type system make such correspondence impossible to express exactly.

This correspondence must be tested.

### 2.3 Runtime contracts are first-class

A protocol type must contain enough information to:

* validate a runtime value
* describe itself for inspection
* provide its corresponding TypeScript type
* participate in route contracts

### 2.4 TypeScript types alone are insufficient

TypeScript types are erased at runtime and therefore cannot protect application boundaries from external data.

Every protocol type must have an associated runtime representation.

### 2.5 Underlying validator is an implementation detail

The initial implementation may use an existing runtime validation library such as Zod.

Application code must interact only with this project's type API.

For example:

```ts
const User = struct({
  name: string(),
  email: string()
})
```

rather than directly depending on Zod's API.

The underlying validation implementation should remain replaceable.

### 2.6 Only project-defined schemas are protocol types

Only schemas explicitly constructed through the project's type API are valid protocol types.

Arbitrary schemas from the underlying validation library must not be accepted directly as protocol types.

This allows the project to define its own semantics for:

* type identity
* inspection
* validation
* future serialization
* compatibility
* protocol metadata

## 3. Types and Values

A protocol type is a schema describing a set of valid values.

A value is an ordinary JavaScript/TypeScript value.

For example:

```ts
const User = struct({
  name: string(),
  email: string()
})

const user = {
  name: "Alice",
  email: "alice@example.com"
}
```

`User` is the schema.

`user` is an ordinary object that may or may not satisfy that schema.

The framework determines whether `user` is valid by evaluating it against the runtime contract represented by `User`.

Values do not need to carry runtime type metadata or wrapper objects.

Once a value has passed the appropriate boundary validation, application code can use it according to its corresponding TypeScript type.

## 4. Primitive Types

The MVP should define a minimal set of primitive types, initially including:

* `string`
* `number`
* `boolean`
* `null`

Additional primitives should not be introduced until their runtime and TypeScript semantics are explicitly defined.

The semantics of special JavaScript values such as `NaN`, `Infinity`, and `undefined` must be explicitly specified rather than inherited accidentally from the underlying validator.

## 5. Composite Types

The MVP should support at least:

### Struct

```ts
const User = struct({
  name: string(),
  email: string()
})
```

### List

```ts
const Users = list(User)
```

### Optional

```ts
const User = struct({
  name: string(),
  nickname: optional(string())
})
```

The precise semantics of optional values must distinguish:

* absent property
* `undefined`
* `null`

rather than treating them as interchangeable accidentally.

## 6. Struct Semantics

The specification must explicitly define:

* whether unknown fields are permitted
* whether missing fields are rejected
* whether fields may contain `undefined`
* whether `null` is distinct from absence
* whether property ordering has any significance
* whether property names are case-sensitive

The preferred MVP behavior should be deterministic and should not depend on incidental behavior of the underlying validator.

## 7. Schema Construction and Type Inference

Schema constructors must produce runtime type descriptors that also carry enough compile-time information for TypeScript to infer the corresponding value type.

Conceptually:

```ts
const User = struct({
  name: string(),
  email: string()
})

type UserValue = Infer<typeof User>
```

The runtime value `User` must provide the contract needed by the boundary runtime:

```ts
User.validate(value)
```

while `Infer<typeof User>` provides the corresponding static type.

A route can therefore use the same schema for both compile-time declarations and runtime enforcement:

```ts
app.route("/users", {
  PUT: {
    input: User,
    output: User,
    handler: (user: Infer<typeof User>) => {
      return user
    }
  }
})
```

The schema must be the single source of truth. The developer should not have to separately define a TypeScript interface and a runtime validator for the same data.

## 8. Static/Runtime Correspondence

For every protocol schema `T`, the system must establish a correspondence between:

```text
T
│
├── runtime contract
│     └── validates values
│
└── TypeScript representation
      └── types values
```

The system must avoid duplicate independent definitions of these contracts.

For example, the following pattern should not be required:

```ts
interface User {
  name: string
  email: string
}

const UserValidator = ...
```

Instead, one schema definition should produce both representations.

The implementation should include tests demonstrating that representative valid and invalid values have consistent runtime and compile-time behavior.

Because TypeScript cannot express every possible runtime constraint, the specification should distinguish:

* constraints that can be represented exactly in TypeScript
* constraints that can only be enforced at runtime

Where a constraint cannot be represented statically, runtime validation remains authoritative at the application boundary.

## 9. Validation

Every protocol type exposes runtime validation.

Conceptually:

```ts
validate(Type, value)
```

returns either a successful validation or a structured validation failure.

Validation must not silently coerce values.

For example, a string `"123"` should not automatically become the number `123` unless coercion is explicitly part of the type contract.

This keeps boundary behavior predictable.

## 10. Boundary Validation

The type system exists primarily to support automatic boundary gates.

For an input contract:

```ts
input: User
```

the runtime must validate the incoming value before invoking the handler.

For an output contract:

```ts
output: User
```

the runtime must validate the handler's result before releasing it.

Conceptually:

```ts
validate(inputType, input)
const result = handler(input)
validate(outputType, result)
return result
```

The developer should not need to write these calls.

This produces two complementary guarantees.

### Compile-time guarantee

The route definition constrains the handler's declared input and output types.

### Runtime guarantee

External values are actually checked before entering trusted application code, and results are checked before leaving it.

Neither guarantee replaces the other.

## 11. Mutation and Trust

Validation establishes that a value satisfies a contract at a particular point in time.

The specification must therefore explicitly define what happens if a validated value is subsequently mutated.

Possible strategies include:

* freezing validated values
* defensive copying
* treating validated values as trusted but mutable
* restricting mutation through the type system

The MVP must choose one strategy rather than leaving the trust invariant ambiguous.

The important invariant is:

> A value must not be considered permanently valid merely because it was valid at some earlier point if application code can subsequently mutate it into an invalid state.

## 12. Type Identity

The MVP must define whether types are:

* structurally identical when their definitions are equivalent
* nominally distinct when constructed separately
* identified by explicit identifiers
* identified by the runtime type descriptor

This matters for:

* route inspection
* compatibility
* caching
* future serialization
* schema evolution

Type identity must not be an accidental consequence of the underlying validation library.

## 13. Inspection

Every protocol type must be inspectable.

Inspection should produce a machine-readable representation describing the type's structure.

For example:

```ts
{
  kind: "struct",
  fields: {
    name: { kind: "string" },
    email: { kind: "string" }
  }
}
```

Inspection must be derived from the actual schema rather than maintained as a second manually synchronized description.

This will eventually allow `INSPECT` to expose route contracts to clients.

## 14. Serialization

Serialization is not part of the MVP type system's core validation semantics.

The type system should, however, be designed so that serialization can later be defined independently of the transport.

A protocol type describes what a value means and whether it is valid.

A transport adapter determines how that value is represented externally.

For example:

```text
Protocol value
     ↓
HTTP adapter → JSON
Other adapter → MessagePack
Other adapter → binary protocol
```

The core type system must not assume JSON merely because HTTP may eventually be supported.

## 15. Parsing vs. Validation

The MVP should distinguish validation from transformation.

Validation answers:

> Does this value satisfy the contract?

Parsing answers:

> Can this external representation be converted into a value satisfying the contract?

The MVP should avoid implicit transformations unless they are explicitly part of the type contract.

This distinction becomes important once transport adapters are introduced, because an HTTP adapter may need to decode JSON while the core runtime should operate on already-decoded protocol values.

## 16. Error Model

Validation failures must be structured rather than represented only by arbitrary strings.

A validation error should provide enough information to identify:

* the violated type
* the location within the value
* the expected constraint
* the received value or relevant description

For example:

```text
User.email
Expected: string
Received: number
```

The precise error representation can evolve, but validation errors must remain machine-readable so transports can translate them appropriately.

## 17. Transport Independence

The type system must not depend on HTTP or any other transport.

A type contract operates on values.

Transport adapters are responsible for converting external representations into protocol-level values before they reach the core runtime and converting validated results back into external representations afterward.

The core type system therefore has no concepts such as:

* HTTP headers
* status codes
* query strings
* cookies
* JSON bodies

## 18. Core Invariants

The MVP is complete only when these invariants hold:

1. Every protocol schema produces both a runtime contract and a corresponding TypeScript value type.
2. The schema is the single source of truth for both representations.
3. The TypeScript representation and runtime validator have corresponding semantics.
4. Every protocol type has a runtime validation contract.
5. Only values that pass an input contract can reach its handler.
6. A handler's result cannot cross the output boundary unless it satisfies the declared output contract.
7. Protocol types are constructed through the project's own API.
8. Type semantics do not depend on the underlying validation library.
9. Type inspection is derived from the actual schema.
10. Validation does not silently coerce values.
11. The core type system has no transport-specific assumptions.
12. The trust implications of mutation after validation are explicitly defined.
13. Type identity is explicitly defined rather than accidental.

## 19. Success Criteria

The type-system MVP succeeds when an application can define a schema such as:

```ts
const User = struct({
  name: string(),
  email: string()
})
```

and the framework can use that single definition to:

* infer the corresponding TypeScript value type
* validate arbitrary runtime values against it
* reject invalid values with structured errors
* inspect its structure programmatically
* use it as an input contract
* use it as an output contract
* guarantee that application handlers only receive validated inputs
* guarantee that external callers only receive validated outputs

without requiring separate TypeScript interfaces and runtime validators.

The resulting model is:

```text
                    SCHEMA
                   /      \
                  /        \
                 ▼          ▼
        TypeScript type   Runtime validator
                 │          │
                 ▼          ▼
          compile-time   runtime boundary
             safety          safety
                 \          /
                  \        /
                   ▼      ▼
                APPLICATION
```

The type system therefore establishes the foundation for the larger application-boundary runtime.

---

# MVP Decisions

This part records how the MVP answers the questions the specification above leaves open. The decisions were agreed with the project owner on 2026-09-30. Each rule is enforced by the code in `src/types/` and pinned by the tests named next to it.

## D1. Primitives

| Type | Accepts | Rejects (examples) |
| --- | --- | --- |
| `string()` | any JavaScript string | numbers, `String` objects, `undefined` |
| `number()` | finite numbers, including `-0` | `NaN`, `Infinity`, `-Infinity`, numeric strings, `bigint`, `Number` objects |
| `boolean()` | `true`, `false` | `"true"`, `0`, `1`, `Boolean` objects |
| `null()` | `null` | `undefined`, `0`, `""`, `false` |

`null` is a reserved word, so the constructor is exported as both `nullType()` and `null` (use it as `t.null()` with a namespace import).

No primitive accepts `undefined`. There is no `undefined` type.

**Decision: `NaN` and `±Infinity` are rejected** (code `not_finite`).

- Why: JSON cannot represent them, so a later transport adapter would silently turn them into `null`, which is the kind of coercion §9 forbids. `NaN !== NaN` also breaks equality and caching.
- Cost: TypeScript's `number` includes these values, so the compiler accepts values the validator rejects. This is a runtime-only constraint (see D8).
- Reversibility: easy. Relaxing a rule only accepts more values, so existing callers keep working. A separate type (for example `float()`) can be added later without changing `number()`.

Tests: `tests/types/primitives.test.ts`.

## D2. Structs

A struct value must be a **plain object**: its prototype is `Object.prototype` or `null`. Arrays, class instances, `Date`, `Map` and the like are rejected as `invalid_type`.

| Question (§6) | Decision |
| --- | --- |
| Unknown fields permitted? | **No.** Every own enumerable string-keyed property must be declared, or the value fails with `unknown_field`. Unknown fields are rejected, not stripped. |
| Missing fields rejected? | **Yes**, for required fields (`missing_field`). Optional fields may be absent. |
| May fields contain `undefined`? | **No.** A required field set to `undefined` is `invalid_type`. An optional field set to `undefined` is `undefined_field`. |
| Is `null` distinct from absence? | **Yes.** `null` is accepted only where the field's type is `null()`. |
| Is property order significant? | **No.** |
| Are property names case-sensitive? | **Yes.** `Name` and `name` are different fields. |

Other rules:

- Symbol-keyed and non-enumerable properties are not fields. They are ignored and not copied into the validated value.
- `__proto__` cannot be declared as a field name (`struct()` throws). In input, an own `__proto__` property is an unknown field.
- `struct()` copies and freezes its field definitions, so changing the object passed to it later does not change the type.

Tests: `tests/types/struct.test.ts`.

## D3. Lists

A list value must satisfy `Array.isArray`, and every element must satisfy the element type. Array-likes, `Set`s and strings are rejected. Holes in sparse arrays are read as `undefined`, which no element type accepts.

Tests: `tests/types/struct.test.ts` ("list semantics").

## D4. Optional

`optional(T)` is a **struct field modifier**, not a type. It can only be used as a struct field, which is the only place a value can be absent. `list(optional(...))` and `optional(...).validate(...)` are compile errors, and throw at runtime.

| Field state | `name: string()` | `nickname: optional(string())` |
| --- | --- | --- |
| absent | ✗ `missing_field` | ✓ |
| `undefined` | ✗ `invalid_type` | ✗ `undefined_field` |
| `null` | ✗ `invalid_type` | ✗ `invalid_type` |
| a string | ✓ | ✓ |

The compiler agrees because `tsconfig.json` enables `exactOptionalPropertyTypes`, which makes `nickname?: string` mean "absent or a string", not "absent, `undefined` or a string". Projects that use gates types should enable it too. Without it, the compiler accepts an explicit `undefined` that the validator rejects.

Tests: `tests/types/struct.test.ts`, `tests/types/correspondence.test.ts`.

## D5. Mutation and trust (§11)

**Decision: validation returns a deep-frozen copy.**

- `validate` reads the input exactly once and builds a fresh copy containing exactly the declared data. The copy is checked, deep-frozen and returned as `result.value`. Reading once means a getter cannot return one value to the check and a different one to the caller.
- The caller's input is never modified or frozen. Later changes to the input do not affect the validated copy, and the copy cannot be changed at all. Writes throw a `TypeError` in strict-mode code, which includes all ES modules.
- `Infer<>` types are deeply `readonly`: struct fields are `readonly` and lists are `readonly T[]`. The compiler rejects mutation before the runtime has to.
- So the invariant in §11 holds directly: a validated value cannot be mutated into an invalid state.
- To change a value, build a new one (`{ ...user, nickname: "Al" }`). A spread copies only the top level, so nested objects need their own spread. The new object is an ordinary unvalidated value until it passes a gate again, for example the output gate.
- Cost: a copy proportional to the value's size on each validation. Readonly types can be awkward to pass to libraries that expect mutable arrays.
- Alternative not taken: "trusted but mutable" costs nothing, but "valid" would then only mean "was valid at the gate". That leaves a time-of-check to time-of-use gap once authorization runs between validation and the handler.

Tests: `tests/types/mutation.test.ts`.

## D6. Type identity (§12)

**Decision: the runtime descriptor is the type.** Every constructor call returns a new, frozen descriptor. Two separately constructed descriptors are distinct types, even with identical definitions. Reusing one descriptor in several places means the same type everywhere.

Identity is not structural, but inspection is: equivalent definitions produce equal inspections. Compatibility checks or caching can compare inspections structurally when that is what they need.

Only descriptors created by the gates constructors are protocol types. Descriptor classes use private fields, so they are nominal at compile time. At runtime they check a module-private construction token and are registered in a private `WeakSet` (`isType`). Zod schemas, look-alike objects and objects created from `Type.prototype` are all rejected.

Tests: `tests/types/identity.test.ts`.

## D7. Validation result and error model (§9, §16)

```ts
type ValidationResult<T> =
  | { ok: true; value: T }            // T is deeply readonly, value is a frozen copy
  | { ok: false; issues: Issue[] }

interface Issue {
  code: "invalid_type" | "not_finite" | "missing_field" | "unknown_field" | "undefined_field"
  path: (string | number)[]  // from the root, e.g. ["members", 1, "email"]
  type: Inspection           // the violated type; for field issues, the struct
  expected: string           // e.g. "string", "finite number", "field present"
  received: string           // a description such as "number", "NaN", "absent", "instance of Date"
}
```

- `validate(Type, value)` and `Type.validate(value)` are equivalent. Neither throws for invalid input, and neither coerces.
- All issues in a struct are reported together. Issue order is deterministic for a given input but not otherwise meaningful.
- `received` describes the value rather than echoing it, so errors cannot leak secrets from input.
- Results and issues are frozen.

Tests: `tests/types/struct.test.ts` ("error model"), `tests/types/primitives.test.ts` ("no coercion").

## D8. Static/runtime correspondence (§8)

The following constraints are represented exactly in TypeScript. The compiler and the validator agree on them:

- primitive kinds
- required vs optional fields (with `exactOptionalPropertyTypes`)
- `null` vs absence vs `undefined`
- list element types
- unknown fields in fresh object literals
- readonly-ness of validated values

These constraints can only be enforced at runtime. The compiler accepts values the validator rejects, and the runtime is authoritative at the boundary:

- `NaN`, `Infinity`, `-Infinity`
- unknown fields on objects that are not fresh literals (TypeScript only checks excess properties on literals)
- class instances whose fields match a struct
- holes in sparse arrays

There is no known case where the validator accepts a value the compiler rejects.

Tests: `tests/types/correspondence.test.ts` checks every case twice. `bun run typecheck` checks the compile-time verdict through type assertions and `@ts-expect-error` lines, and `bun test` checks the runtime verdict.

## D9. Inspection (§13)

`Type.inspect()` or `inspect(Type)` returns frozen, JSON-compatible data derived from the descriptor:

```ts
{ kind: "string" } | { kind: "number" } | { kind: "boolean" } | { kind: "null" }
{ kind: "list", element: Inspection }
{ kind: "struct", fields: { [name]: Inspection | { kind: "optional", type: Inspection } } }
```

Tests: `tests/types/inspect.test.ts`.

## D10. Underlying validator (§2.5)

Zod is used only in `src/types/backend/zod.ts`. The backend reports *where* a value failed, and gates' own rules in `src/types/validate.ts` decide *what* the failure is, using gates' issue codes. So the semantics above are defined by gates, not by Zod. Where Zod's defaults differ (it accepts class instances as objects and treats an explicit `undefined` as absence), the backend adds gates' rules.

If the backend ever rejects a value that gates' rules would accept, validation throws instead of guessing. That fails closed at the boundary and makes the disagreement visible in tests. Replacing Zod means replacing that one file.

Tests: `tests/architecture/validator-isolation.test.ts` enforces that no other file in `src/` or `demos/` imports Zod.

## D11. Scope

The core invariants about gates (§18, items 5 and 6: inputs validated before the handler, outputs validated before release) belong to the runtime and are specified in `spec/02-routes.md`. The type system provides the `validate` contract they build on.

## Invariant checklist (§18)

| # | Invariant | Where it holds |
| --- | --- | --- |
| 1 | Schema produces a runtime contract and a TS type | `Type<T>` and `Infer`; `correspondence.test.ts` |
| 2 | Schema is the single source of truth | `Infer` reads the type from the descriptor; no separate interfaces |
| 3 | TS type and validator correspond | D8; `correspondence.test.ts` |
| 4 | Every protocol type has a runtime validation contract | `Type.validate`; every constructor returns a `Type` |
| 5 | Only valid inputs reach handlers | runtime, spec 02 |
| 6 | Only valid outputs cross the boundary | runtime, spec 02 |
| 7 | Types are constructed through the project's API | D6; `identity.test.ts` |
| 8 | Semantics do not depend on the validation library | D10; `validator-isolation.test.ts` and the semantics tests |
| 9 | Inspection is derived from the schema | D9; `inspect.ts` walks the descriptor |
| 10 | No silent coercion | D7; `primitives.test.ts` |
| 11 | No transport assumptions | `src/types` has no transport imports; `dependencies.test.ts` |
| 12 | Mutation after validation is defined | D5; `mutation.test.ts` |
| 13 | Type identity is defined | D6; `identity.test.ts` |
