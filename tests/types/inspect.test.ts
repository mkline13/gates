import { describe, expect, test } from "bun:test"
import * as t from "../../src/types"

describe("inspection", () => {
  test("matches the shape in spec/01-types.md", () => {
    const User = t.struct({ name: t.string(), email: t.string() })
    expect(User.inspect()).toEqual({
      kind: "struct",
      fields: {
        name: { kind: "string" },
        email: { kind: "string" },
      },
    })
  })

  test("covers every kind", () => {
    const All = t.struct({
      s: t.string(),
      n: t.number(),
      b: t.boolean(),
      z: t.null(),
      l: t.list(t.list(t.number())),
      o: t.optional(t.struct({ inner: t.boolean() })),
    })
    expect(t.inspect(All)).toEqual({
      kind: "struct",
      fields: {
        s: { kind: "string" },
        n: { kind: "number" },
        b: { kind: "boolean" },
        z: { kind: "null" },
        l: { kind: "list", element: { kind: "list", element: { kind: "number" } } },
        o: { kind: "optional", type: { kind: "struct", fields: { inner: { kind: "boolean" } } } },
      },
    })
  })

  test("is plain, JSON-compatible data", () => {
    const User = t.struct({ tags: t.list(t.string()), nickname: t.optional(t.string()) })
    const inspected = User.inspect()
    expect(JSON.parse(JSON.stringify(inspected))).toEqual(inspected)
  })

  test("is frozen, so callers cannot edit a type's description", () => {
    const inspected = t.struct({ name: t.string() }).inspect()
    expect(Object.isFrozen(inspected)).toBe(true)
    if (inspected.kind === "struct") expect(Object.isFrozen(inspected.fields)).toBe(true)
  })
})
