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
