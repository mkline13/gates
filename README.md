# Gates

**Gates** is a typed application-boundary runtime for TypeScript.

Applications repeatedly implement the same boundary logic:

```text
request
→ authenticate
→ validate
→ authorize
→ execute
→ validate result
→ respond
```

Gates makes these boundaries declarative. The developer defines the types, routes, access requirements, and handlers; Gates automatically controls the gates between untrusted requests and application code.

## Core idea

A route defines a contract:

```ts
app.route("/users", {
  GET: {
    input: UserQuery,
    output: UserList,
    access: requires("users.read"),

    handler: (query, identity) => {
      return getUsers(query, identity)
    }
  }
})
```

Gates then guarantees that:

1. The caller is authenticated.
2. The request satisfies the route's input schema.
3. The caller is authorized to access the route.
4. The handler receives values matching its declared types.
5. The handler's result satisfies the declared output schema.

The application developer does not need to manually implement these checks.

Conceptually:

```text
                   REQUEST
                      │
                      ▼
              ┌──────────────┐
              │ Authenticate │
              └──────┬───────┘
                     │
                 Identity
                     │
                     ▼
              ┌──────────────┐
              │ Input Gate  │
              └──────┬───────┘
                     │
                   valid
                     │
                     ▼
              ┌──────────────┐
              │ Authorization│
              └──────┬───────┘
                     │
                 permitted
                     │
                     ▼
              ┌──────────────┐
              │   Handler    │
              └──────┬───────┘
                     │
                   result
                     │
                     ▼
              ┌──────────────┐
              │ Output Gate  │
              └──────┬───────┘
                     │
                   valid
                     │
                     ▼
                  RESULT
```

## Security model

Gates uses a **fail-closed** authorization model.

Every route has explicit access semantics.

A route with no `access` declaration is inaccessible to everyone.

Public access must be explicit:

```ts
access: anyone
```

Protected access can require a capability:

```ts
access: requires("documents.read")
```

Authentication is pluggable. The application depends on an abstract `Identity`, rather than a particular authentication mechanism.

This allows development and production to use different authenticators:

```text
development → test authenticator
production  → OAuth/JWT/session/etc.
```

The authorization model remains the same.

## Type system

Gates schemas produce both:

* a TypeScript type for compile-time use
* a runtime validator for boundary enforcement

For example:

```ts
const User = struct({
  name: string(),
  email: string()
})

type UserValue = Infer<typeof User>
```

The schema is the single source of truth.

It can be used by application code:

```ts
function createUser(user: UserValue): UserValue {
  return user
}
```

and by the runtime:

```ts
User.validate(value)
```

The system should not require developers to separately maintain TypeScript interfaces and runtime validation schemas.

The underlying validation library is an implementation detail. The initial implementation will use Zod behind Gates' own type API.

## Transport independence

The core Gates runtime is independent of HTTP.

The MVP operates entirely in-process:

```text
Application
    │
    ▼
Gates Runtime
```

Transport adapters can be added later:

```text
                 ┌── in-process
                 │
Gates Runtime ───┼── HTTP
                 │
                 ├── MCP
                 │
                 ├── Unix socket
                 │
                 └── other transports
```

A transport adapter translates an external request into a Gates request and translates the resulting Gates response back into the transport's representation.

The core runtime should have no knowledge of:

* HTTP headers
* status codes
* cookies
* URLs as transport-specific concepts
* JSON
* TCP
* MCP

This keeps the application boundary independent of how requests reach it.

## MVP

The first version of Gates will be a small TypeScript library running under **Bun**.

The MVP will establish the fundamental abstractions before introducing networking.

### MVP steps

The `demos/` directory contains one small executable example for each stage of the MVP.

#### 1. Types

Define schemas that produce both TypeScript types and runtime validators.

```text
demos/01-types.ts
```

#### 2. Routes

Define typed application routes.

```text
demos/02-routes.ts
```

#### 3. Input gates

Demonstrate automatic runtime validation before a handler executes.

```text
demos/03-input-gates.ts
```

#### 4. Output gates

Demonstrate automatic validation of handler results.

```text
demos/04-output-gates.ts
```

#### 5. Authentication

Add a pluggable authenticator that produces an `Identity`.

```text
demos/05-authentication.ts
```

#### 6. Authorization

Add explicit route access requirements and fail-closed defaults.

```text
demos/06-authorization.ts
```

#### 7. Inspection

Expose route and type contracts programmatically.

```text
demos/07-inspection.ts
```

The exact demo sequence may evolve as the implementation develops.

## Project structure

```text
gates/
├── README.md
├── package.json
├── tsconfig.json
│
├── spec/
│   ├── 01-types.md
│   ├── 02-routes.md
│   └── ...
│
├── demos/
│   ├── 01-types.ts
│   ├── 02-routes.ts
│   ├── 03-input-gates.ts
│   ├── 04-output-gates.ts
│   ├── 05-authentication.ts
│   ├── 06-authorization.ts
│   └── 07-inspection.ts
│
├── tests/
│   ├── architecture/
│   ├── types/
│   ├── runtime/
│   └── ...
│
└── src/
    ├── types/
    │   ├── primitives.ts
    │   ├── composites.ts
    │   ├── infer.ts
    │   └── ...
    │
    ├── runtime/
    │   ├── app.ts
    │   ├── route.ts
    │   ├── request.ts
    │   ├── identity.ts
    │   └── ...
    │
    └── http-server/
        └── ...
```

### Source structure

`src/` separates type definitions, boundary enforcement, and transport adapters.

#### `types/`

`types/` defines Gates' type system. Its schemas provide both:

* a TypeScript representation
* a runtime validation contract

The type system knows nothing about routes, authentication, HTTP, or application execution. Its job is to answer:

> What values are valid, and what does their TypeScript type look like?

#### `runtime/`

`runtime/` implements the actual Gates boundary. It is responsible for:

* registering routes
* constructing requests
* authentication
* authorization
* input validation
* invoking handlers
* output validation
* structured errors
* route inspection

#### `http-server/`

`http-server/` will eventually contain the HTTP transport adapter, translating between HTTP and the transport-independent runtime:

```text
HTTP Request → HTTP Adapter → Gates Request → Gates Runtime
             → Gates Result → HTTP Adapter → HTTP Response
```

It may eventually handle HTTP routing, headers, cookies, request decoding, response serialization, and status codes. None of these concerns may leak into `runtime/` or `types/`.

`http-server/` is reserved and is not part of the MVP.

#### Dependency direction

```text
types
  ↑
runtime
  ↑
http-server
```

`runtime/` depends on `types/`; `types/` never depends on `runtime/`. Nothing in `types/` or `runtime/` depends on `http-server/`. `tests/architecture/` enforces this.

#### Why this separation matters

```text
┌─────────────────────┐
│       Types         │
│ What is valid?      │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│      Runtime        │
│ What is permitted?  │
│ What gets executed? │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│     Transport       │
│ How does it arrive? │
└─────────────────────┘
```

The MVP only needs `types` + `runtime`. Later, HTTP becomes one transport adapter, and other transports can be added without changing route definitions or core boundary semantics.

## Development stack

The initial implementation uses:

* **Bun** — runtime, package manager, and test runner
* **TypeScript** — implementation language
* **Zod** — initial runtime validation implementation
* **Bun Test** — test framework

Bun is the development/runtime environment, not part of the conceptual protocol. The core library should avoid unnecessary Bun-specific APIs so that it remains portable to other JavaScript runtimes.

## Design principles

### The boundary owns the gates

Validation, authentication, and authorization should be enforced by the Gates runtime rather than being optional utilities that developers have to remember to call.

### Fail closed

Security-sensitive behavior defaults to rejection.

In particular:

```ts
// No access declaration
// → nobody can access this route
```

Public access must be explicit:

```ts
access: anyone
```

### One schema, two representations

A schema should produce both the static TypeScript type and the runtime validation contract.

The developer should not have to maintain two separate definitions.

### Transport-independent core

The core runtime describes application semantics, not network protocols.

### Pluggable authentication

Authentication mechanisms are adapters that produce the common `Identity` abstraction.

### Explicit contracts

Routes declare their input, output, and access requirements.

The runtime enforces those declarations.

## Status

Gates is currently in the **MVP design and implementation phase**.

The immediate goal is not to build a web framework or production API server.

The immediate goal is to prove that a small, transport-independent runtime can reliably enforce typed and authorized application boundaries.

Once that foundation is solid, transports such as HTTP can be added as adapters.
