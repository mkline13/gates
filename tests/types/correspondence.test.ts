// Static/runtime correspondence (spec/01-types.md §8).
//
// Each case below is checked twice: by the compiler (`bun run typecheck`,
// through the declared types and @ts-expect-error lines) and by the runtime
// validator (`bun test`). A case whose compile-time and runtime verdicts
// disagree must be listed under "runtime-only constraints".
import { describe, expect, test } from "bun:test"
import * as t from "../../src/types"
import type { Equal, Expect } from "./helpers"

const User = t.struct({
  name: t.string(),
  age: t.number(),
  admin: t.boolean(),
  deletedAt: t.null(),
  tags: t.list(t.string()),
  nickname: t.optional(t.string()),
})
type User = t.Infer<typeof User>

// The inferred type, spelled out.
type _inferred = Expect<
  Equal<
    User,
    {
      readonly name: string
      readonly age: number
      readonly admin: boolean
      readonly deletedAt: null
      readonly tags: readonly string[]
      readonly nickname?: string
    }
  >
>
type _primitives = Expect<
  Equal<
    [t.Infer<ReturnType<typeof t.string>>, t.Infer<ReturnType<typeof t.number>>, t.Infer<ReturnType<typeof t.boolean>>, t.Infer<ReturnType<typeof t.null>>],
    [string, number, boolean, null]
  >
>

const base = { name: "Alice", age: 30, admin: false, deletedAt: null, tags: [] }

describe("both the compiler and the validator accept", () => {
  const cases: User[] = [
    base,
    { ...base, nickname: "Al" },
    { ...base, tags: ["a", "b"] },
    { ...base, age: -0.5 },
  ]
  test.each(cases.map((c) => [c]))("%p", (value) => {
    expect(User.validate(value).ok).toBe(true)
  })
})

describe("both the compiler and the validator reject", () => {
  test("missing required field", () => {
    // @ts-expect-error name is required
    const value: User = { age: 30, admin: false, deletedAt: null, tags: [] }
    expect(User.validate(value).ok).toBe(false)
  })

  test("wrong primitive", () => {
    // @ts-expect-error age is a number
    const value: User = { ...base, age: "30" }
    expect(User.validate(value).ok).toBe(false)
  })

  test("null where a value is required", () => {
    // @ts-expect-error name is not nullable
    const value: User = { ...base, name: null }
    expect(User.validate(value).ok).toBe(false)
  })

  test("value where null is required", () => {
    // @ts-expect-error deletedAt is null
    const value: User = { ...base, deletedAt: "yesterday" }
    expect(User.validate(value).ok).toBe(false)
  })

  test("null for an optional field", () => {
    // @ts-expect-error optional is not nullable
    const value: User = { ...base, nickname: null }
    expect(User.validate(value).ok).toBe(false)
  })

  test("explicit undefined for an optional field", () => {
    // @ts-expect-error absent is not the same as undefined (exactOptionalPropertyTypes)
    const value: User = { ...base, nickname: undefined }
    expect(User.validate(value).ok).toBe(false)
  })

  test("wrong list element", () => {
    // @ts-expect-error tags holds strings
    const value: User = { ...base, tags: [1] }
    expect(User.validate(value).ok).toBe(false)
  })

  test("unknown field in an object literal", () => {
    // @ts-expect-error excess property
    const value: User = { ...base, role: "root" }
    expect(User.validate(value).ok).toBe(false)
  })

  test("not an object", () => {
    // @ts-expect-error a list is not a User
    const value: User = [base]
    expect(User.validate(value).ok).toBe(false)
  })

  test("mutation of a validated value", () => {
    const result = User.validate(base)
    if (!result.ok) throw new Error("expected valid")
    expect(() => {
      // @ts-expect-error validated values are readonly
      result.value.name = "Mallory"
    }).toThrow(TypeError)
    expect(() => {
      // @ts-expect-error validated lists are readonly
      result.value.tags.push("x")
    }).toThrow(TypeError)
  })
})

// TypeScript cannot express these rules, so the compiler accepts values the
// validator rejects. Runtime validation is authoritative at the boundary.
describe("runtime-only constraints", () => {
  test("NaN and infinities are numbers to TypeScript but not finite numbers", () => {
    for (const age of [NaN, Infinity, -Infinity]) {
      const value: User = { ...base, age }
      expect(User.validate(value).ok).toBe(false)
    }
  })

  test("extra fields pass the compiler when the object is not a fresh literal", () => {
    const withRole = { ...base, role: "root" }
    const value: User = withRole
    expect(User.validate(value).ok).toBe(false)
  })

  test("class instances with matching fields pass the compiler", () => {
    class UserClass {
      name = "Alice"
      age = 30
      admin = false
      deletedAt = null
      tags: string[] = []
    }
    const value: User = new UserClass()
    expect(User.validate(value).ok).toBe(false)
  })

  test("sparse arrays pass the compiler", () => {
    const tags = ["a", "b"]
    delete tags[0]
    const value: User = { ...base, tags }
    expect(User.validate(value).ok).toBe(false)
  })
})
