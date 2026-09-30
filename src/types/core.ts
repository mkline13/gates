import { inspect, type Inspection } from "./inspect"
import { validate, type ValidationResult } from "./validate"

// Carries a type's value type at compile time. Never present at runtime.
declare const valueType: unique symbol

// Only this module's constructors may create descriptors. The token is not
// exported from the public API, so neither application code nor the
// underlying validation library can produce a protocol type.
export const internal: unique symbol = Symbol("gates.types.internal")

export type Node =
  | { readonly kind: "string" }
  | { readonly kind: "number" }
  | { readonly kind: "boolean" }
  | { readonly kind: "null" }
  | { readonly kind: "list"; readonly element: Type<unknown> }
  | { readonly kind: "struct"; readonly fields: Readonly<Record<string, Field>> }

export interface Field {
  readonly type: Type<unknown>
  readonly optional: boolean
}

const registry = new WeakSet<object>()

// A protocol type: a runtime descriptor whose value type is recoverable with
// Infer. Identity is the descriptor itself: two separately constructed
// descriptors are distinct types even when their definitions are equivalent.
export class Type<out T> {
  declare readonly [valueType]: T
  readonly #brand = true
  readonly node: Node

  constructor(token: typeof internal, node: Node) {
    if (token !== internal) {
      throw new TypeError("Protocol types must be constructed through the gates type API")
    }
    this.node = node
    registry.add(this)
    Object.freeze(this)
  }

  validate(value: unknown): ValidationResult<T> {
    return validate(this, value)
  }

  inspect(): Inspection {
    return inspect(this)
  }
}

// Marks a struct field as optional. Not a type on its own: it is only
// meaningful as a struct field, where absence is possible.
export class Optional<out T> {
  declare readonly [valueType]: T
  readonly #brand = true
  readonly type: Type<T>

  constructor(token: typeof internal, type: Type<T>) {
    if (token !== internal) {
      throw new TypeError("Optional fields must be constructed through the gates type API")
    }
    this.type = type
    registry.add(this)
    Object.freeze(this)
  }
}

export function isType(value: unknown): value is Type<unknown> {
  return value instanceof Type && registry.has(value)
}

export function isOptional(value: unknown): value is Optional<unknown> {
  return value instanceof Optional && registry.has(value)
}

// The TypeScript value type of a protocol type.
export type Infer<T extends Type<unknown>> = T[typeof valueType]
