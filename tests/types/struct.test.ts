import { describe, expect, test } from "bun:test"
import * as t from "../../src/types"

const User = t.struct({ name: t.string(), nickname: t.optional(t.string()) })

function codes(result: t.ValidationResult<unknown>) {
  return result.ok ? [] : result.issues.map((i) => [i.code, i.path])
}

describe("struct semantics", () => {
  test("accepts exactly the declared fields", () => {
    expect(User.validate({ name: "Alice" }).ok).toBe(true)
    expect(User.validate({ name: "Alice", nickname: "Al" }).ok).toBe(true)
  })

  test("rejects unknown fields", () => {
    expect(codes(User.validate({ name: "Alice", admin: true }))).toEqual([["unknown_field", ["admin"]]])
  })

  test("rejects missing required fields", () => {
    expect(codes(User.validate({}))).toEqual([["missing_field", ["name"]]])
  })

  test("a required field present as undefined is an invalid value, not absence", () => {
    expect(codes(User.validate({ name: undefined }))).toEqual([["invalid_type", ["name"]]])
  })

  test("an optional field present as undefined is rejected", () => {
    expect(codes(User.validate({ name: "Alice", nickname: undefined }))).toEqual([
      ["undefined_field", ["nickname"]],
    ])
  })

  test("null is distinct from absence", () => {
    expect(codes(User.validate({ name: "Alice", nickname: null }))).toEqual([["invalid_type", ["nickname"]]])
    expect(codes(User.validate({ name: null }))).toEqual([["invalid_type", ["name"]]])
  })

  test("null is allowed where the field type is null", () => {
    const Maybe = t.struct({ value: t.null() })
    expect(Maybe.validate({ value: null }).ok).toBe(true)
    expect(codes(Maybe.validate({}))).toEqual([["missing_field", ["value"]]])
  })

  test("property order is not significant", () => {
    const Pair = t.struct({ a: t.string(), b: t.number() })
    expect(Pair.validate({ a: "x", b: 1 }).ok).toBe(true)
    expect(Pair.validate({ b: 1, a: "x" }).ok).toBe(true)
  })

  test("property names are case-sensitive", () => {
    expect(codes(User.validate({ Name: "Alice" }))).toEqual([
      ["unknown_field", ["Name"]],
      ["missing_field", ["name"]],
    ])
  })

  test("only plain objects are structs", () => {
    class Person {
      name = "Alice"
    }
    const rejected = [new Person(), new Date(), [], ["Alice"], null, undefined, "Alice", new Map([["name", "Alice"]])]
    for (const value of rejected) {
      expect(codes(User.validate(value))).toEqual([["invalid_type", []]])
    }
  })

  test("null-prototype objects are plain objects", () => {
    const value = Object.assign(Object.create(null), { name: "Alice" })
    const result = User.validate(value)
    expect(result.ok).toBe(true)
    if (result.ok) expect(Object.getPrototypeOf(result.value)).toBe(Object.prototype)
  })

  test("symbol-keyed and non-enumerable properties are not fields", () => {
    const value = { name: "Alice", [Symbol("tag")]: 1 }
    Object.defineProperty(value, "hidden", { value: 1, enumerable: false })
    const result = User.validate(value)
    expect(result.ok).toBe(true)
    if (result.ok) expect(Reflect.ownKeys(result.value)).toEqual(["name"])
  })

  test("__proto__ cannot be declared as a field and is an unknown field in input", () => {
    expect(() => t.struct({ ["__proto__"]: t.string() })).toThrow(TypeError)
    const input = JSON.parse('{"name": "Alice", "__proto__": {"admin": true}}')
    expect(codes(User.validate(input))).toEqual([["unknown_field", ["__proto__"]]])
  })

  test("reports every problem in a struct together", () => {
    const Profile = t.struct({ name: t.string(), age: t.number(), tags: t.list(t.string()) })
    expect(codes(Profile.validate({ name: 1, age: NaN, tags: ["a", 2], extra: true }))).toEqual([
      ["unknown_field", ["extra"]],
      ["invalid_type", ["name"]],
      ["not_finite", ["age"]],
      ["invalid_type", ["tags", 1]],
    ])
  })
})

describe("list semantics", () => {
  const Names = t.list(t.string())

  test("accepts arrays whose elements all match", () => {
    expect(Names.validate([]).ok).toBe(true)
    expect(Names.validate(["a", "b"]).ok).toBe(true)
  })

  test("reports each bad element by index", () => {
    expect(codes(Names.validate(["a", 1, null]))).toEqual([
      ["invalid_type", [1]],
      ["invalid_type", [2]],
    ])
  })

  test("holes in sparse arrays are undefined elements", () => {
    const sparse = ["a", "b", "c"]
    delete sparse[1]
    expect(codes(Names.validate(sparse))).toEqual([["invalid_type", [1]]])
  })

  test("rejects non-arrays, including array-likes", () => {
    for (const value of [{ 0: "a", length: 1 }, "ab", new Set(["a"]), null]) {
      expect(codes(Names.validate(value))).toEqual([["invalid_type", []]])
    }
  })

  test("nested paths point at the offending value", () => {
    const Team = t.struct({ members: t.list(t.struct({ email: t.string() })) })
    expect(Team.validate({ members: [{ email: "a@x" }, { email: 5 }] })).toEqual({
      ok: false,
      issues: [
        {
          code: "invalid_type",
          path: ["members", 1, "email"],
          type: { kind: "string" },
          expected: "string",
          received: "number",
        },
      ],
    })
  })
})

describe("error model", () => {
  test("issues identify the violated type, location, expectation and received value", () => {
    expect(User.validate({ nickname: 5 })).toEqual({
      ok: false,
      issues: [
        { code: "missing_field", path: ["name"], type: User.inspect(), expected: "field present", received: "absent" },
        { code: "invalid_type", path: ["nickname"], type: { kind: "string" }, expected: "string", received: "number" },
      ],
    })
  })

  test("issues describe received values without echoing them", () => {
    const result = t.string().validate({ password: "hunter2" })
    expect(JSON.stringify(result)).not.toContain("hunter2")
  })

  test("results and issues are frozen", () => {
    const result = User.validate({})
    expect(Object.isFrozen(result)).toBe(true)
    if (!result.ok) {
      expect(Object.isFrozen(result.issues)).toBe(true)
      expect(Object.isFrozen(result.issues[0])).toBe(true)
      expect(Object.isFrozen(result.issues[0]!.path)).toBe(true)
    }
  })

  test("the free validate() function matches the method", () => {
    expect(t.validate(User, { name: 1 })).toEqual(User.validate({ name: 1 }))
  })
})
