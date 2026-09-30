import { findIssueLocations, type Location } from "./backend/zod"
import type { Type } from "./core"
import { inspect, type Inspection } from "./inspect"
import { isPlainObject } from "./values"

export type IssueCode =
  | "invalid_type" // the value is not of the expected kind
  | "not_finite" // a number was NaN, Infinity or -Infinity
  | "missing_field" // a required struct field is absent
  | "unknown_field" // a struct has a field its type does not declare
  | "undefined_field" // an optional struct field is present with value undefined

export interface Issue {
  readonly code: IssueCode
  // Location of the offending value from the root, e.g. ["users", 0, "email"].
  readonly path: readonly (string | number)[]
  // The type whose rule was violated. For field issues this is the struct.
  readonly type: Inspection
  readonly expected: string
  readonly received: string
}

export type ValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly Issue[] }

// Checks a value against a type without coercing it.
//
// On success, `value` is a deep-frozen copy of the input containing exactly
// the declared data. The input itself is never modified, and later changes to
// the input do not affect the validated copy.
export function validate<T>(type: Type<T>, input: unknown): ValidationResult<T> {
  // Read the input exactly once, so getters or later mutation cannot make the
  // checked value differ from the returned one.
  const value = snapshot(type, input)

  const issues = dedupe(findIssueLocations(type, value).flatMap((location) => classify(location)))
  if (issues.length > 0) {
    return Object.freeze({ ok: false, issues: Object.freeze(issues) })
  }
  return Object.freeze({ ok: true, value: deepFreeze(value) as T })
}

// Copies the parts of the input the type can see. Plain objects become fresh
// plain objects (all own enumerable string keys, so unknown fields are still
// reported), arrays become fresh arrays, and everything else is kept as is.
// The walk follows the type, which is finite, so cyclic inputs terminate.
function snapshot(type: Type<unknown>, input: unknown): unknown {
  const node = type.node
  if (node.kind === "struct" && isPlainObject(input)) {
    const copy: Record<string, unknown> = {}
    for (const name of Object.keys(input)) {
      const field = Object.hasOwn(node.fields, name) ? node.fields[name] : undefined
      const fieldValue = input[name]
      define(copy, name, field ? snapshot(field.type, fieldValue) : fieldValue)
    }
    return copy
  }
  if (node.kind === "list" && Array.isArray(input)) {
    return Array.from({ length: input.length }, (_, i) => snapshot(node.element, input[i]))
  }
  return input
}

// Turns a location the backend rejected into issues under gates' own rules.
// The backend decides where to look; gates decides what is wrong.
function classify({ type, value, path, parent }: Location): Issue[] {
  if (parent) {
    const { struct, object, name } = parent
    const declared = struct.node.kind === "struct" ? struct.node.fields[name] : undefined
    const present = Object.hasOwn(object, name)
    if (!declared) {
      return [issue("unknown_field", path, struct, "no such field", describe(value))]
    }
    if (!present && !declared.optional) {
      return [issue("missing_field", path, struct, "field present", "absent")]
    }
    if (present && value === undefined && declared.optional) {
      return [
        issue("undefined_field", path, struct, `absent or ${declared.type.node.kind}`, "undefined"),
      ]
    }
  }

  const expected = type.node.kind
  switch (type.node.kind) {
    case "string":
      if (typeof value !== "string") return [issue("invalid_type", path, type, expected, describe(value))]
      break
    case "number":
      if (typeof value !== "number") return [issue("invalid_type", path, type, expected, describe(value))]
      if (!Number.isFinite(value)) return [issue("not_finite", path, type, "finite number", describe(value))]
      break
    case "boolean":
      if (typeof value !== "boolean") return [issue("invalid_type", path, type, expected, describe(value))]
      break
    case "null":
      if (value !== null) return [issue("invalid_type", path, type, expected, describe(value))]
      break
    case "list":
      if (!Array.isArray(value)) return [issue("invalid_type", path, type, expected, describe(value))]
      break
    case "struct":
      if (!isPlainObject(value)) return [issue("invalid_type", path, type, expected, describe(value))]
      break
  }

  // The backend rejected something gates' rules accept. Fail closed rather
  // than let the two disagree silently.
  throw new Error(
    `gates: validation backend rejected a value at ${JSON.stringify(path)} that the type system accepts`,
  )
}

function issue(
  code: IssueCode,
  path: readonly (string | number)[],
  type: Type<unknown>,
  expected: string,
  received: string,
): Issue {
  return Object.freeze({ code, path: Object.freeze([...path]), type: inspect(type), expected, received })
}

function dedupe(issues: Issue[]): Issue[] {
  const seen = new Set<string>()
  return issues.filter((i) => {
    const key = `${i.code}:${JSON.stringify(i.path)}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// A short description of a received value, never the value itself.
export function describe(value: unknown): string {
  if (value === null) return "null"
  if (Array.isArray(value)) return "list"
  if (typeof value === "number") {
    if (Number.isNaN(value)) return "NaN"
    if (value === Infinity) return "Infinity"
    if (value === -Infinity) return "-Infinity"
    return "number"
  }
  if (typeof value === "object") {
    if (isPlainObject(value)) return "object"
    const name = Object.getPrototypeOf(value)?.constructor?.name
    return typeof name === "string" && name !== "" ? `instance of ${name}` : "object"
  }
  return typeof value
}

function define(target: object, name: string, value: unknown): void {
  // defineProperty, not assignment, so a field named "__proto__" stays data.
  Object.defineProperty(target, name, { value, enumerable: true, writable: true, configurable: true })
}

function deepFreeze(value: unknown): unknown {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value)) deepFreeze(child)
  }
  return value
}
