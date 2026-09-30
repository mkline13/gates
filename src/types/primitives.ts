import { internal, Type } from "./core"

// Any JavaScript string.
export function string(): Type<string> {
  return new Type(internal, { kind: "string" })
}

// A finite number. NaN, Infinity and -Infinity are rejected at runtime; the
// TypeScript `number` type cannot express this, so it is a runtime-only
// constraint.
export function number(): Type<number> {
  return new Type(internal, { kind: "number" })
}

// `true` or `false`.
export function boolean(): Type<boolean> {
  return new Type(internal, { kind: "boolean" })
}

// Exactly `null`. Named nullType because `null` is a reserved word; the
// public API also exports it as `null` for namespace use (`t.null()`).
export function nullType(): Type<null> {
  return new Type(internal, { kind: "null" })
}
