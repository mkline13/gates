import { describe, expect, test } from "bun:test"
import { z } from "zod"
import * as t from "../../src/types"
import { Type } from "../../src/types/core"

describe("type identity: the descriptor is the type", () => {
  test("separately constructed equivalent types are distinct", () => {
    const A = t.struct({ name: t.string() })
    const B = t.struct({ name: t.string() })
    expect(A).not.toBe(B)
    expect(t.string()).not.toBe(t.string())
  })

  test("equivalent types still inspect identically", () => {
    const A = t.struct({ name: t.string() })
    const B = t.struct({ name: t.string() })
    expect(A.inspect()).toEqual(B.inspect())
  })

  test("a descriptor is the same type wherever it is used", () => {
    const Email = t.string()
    const User = t.struct({ primary: Email, backup: Email })
    const node = User.node
    if (node.kind !== "struct") throw new Error("expected struct")
    expect(node.fields.primary!.type).toBe(Email)
    expect(node.fields.backup!.type).toBe(Email)
  })

  test("descriptors are immutable", () => {
    const User = t.struct({ name: t.string() })
    expect(Object.isFrozen(User)).toBe(true)
    const node = User.node
    if (node.kind !== "struct") throw new Error("expected struct")
    expect(Object.isFrozen(node.fields)).toBe(true)
    expect(Object.isFrozen(node.fields.name)).toBe(true)
  })

  test("changing the object passed to struct() does not change the type", () => {
    const fields: Record<string, t.Type<unknown>> = { name: t.string() }
    const User = t.struct(fields)
    fields.admin = t.boolean()
    expect(User.validate({ name: "Alice" }).ok).toBe(true)
    expect(User.validate({ name: "Alice", admin: true }).ok).toBe(false)
  })
})

describe("only project-defined schemas are protocol types", () => {
  test("isType recognises only descriptors built by the API", () => {
    expect(t.isType(t.string())).toBe(true)
    expect(t.isType(z.string())).toBe(false)
    expect(t.isType({ kind: "string", validate: () => ({ ok: true }) })).toBe(false)
    expect(t.isType(Object.create(Type.prototype))).toBe(false)
    expect(t.isType(t.optional(t.string()))).toBe(false)
  })

  test("constructors reject underlying-library schemas", () => {
    // @ts-expect-error a Zod schema is not a protocol type
    expect(() => t.struct({ name: z.string() })).toThrow(TypeError)
    // @ts-expect-error a Zod schema is not a protocol type
    expect(() => t.list(z.string())).toThrow(TypeError)
    // @ts-expect-error a Zod schema is not a protocol type
    expect(() => t.optional(z.string())).toThrow(TypeError)
  })

  test("constructors reject look-alike objects", () => {
    const fake = { kind: "string", node: { kind: "string" }, validate: () => ({ ok: true }) }
    // @ts-expect-error a structural look-alike is not a protocol type
    expect(() => t.list(fake)).toThrow(TypeError)
  })

  test("Type cannot be constructed without the internal token", () => {
    // @ts-expect-error the token is not part of the public API
    expect(() => new Type(Symbol("fake"), { kind: "string" })).toThrow(TypeError)
  })

  test("optional() is only meaningful as a struct field", () => {
    // @ts-expect-error optional is not a type
    expect(() => t.list(t.optional(t.string()))).toThrow(TypeError)
    // @ts-expect-error optional has no validate
    expect(() => t.optional(t.string()).validate("x")).toThrow()
  })
})
