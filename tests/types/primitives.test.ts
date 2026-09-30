import { describe, expect, test } from "bun:test"
import * as t from "../../src/types"

const cases: [string, t.Type<unknown>, unknown[], unknown[]][] = [
  ["string", t.string(), ["", "abc", "123"], [123, true, null, undefined, {}, [], Symbol("s"), 1n, new String("s")]],
  [
    "number",
    t.number(),
    [0, -0, 1.5, -42, Number.MAX_VALUE, Number.MIN_SAFE_INTEGER],
    ["123", NaN, Infinity, -Infinity, true, null, undefined, 1n, new Number(1)],
  ],
  ["boolean", t.boolean(), [true, false], ["true", 0, 1, null, undefined, new Boolean(true)]],
  ["null", t.null(), [null], [undefined, 0, "", false, "null", {}]],
]

describe.each(cases)("%s()", (_, type, accepted, rejected) => {
  test.each(accepted.map((v) => [v]))("accepts %p", (value) => {
    const result = type.validate(value)
    expect(result.ok).toBe(true)
    if (result.ok) expect(Object.is(result.value, value)).toBe(true)
  })

  test.each(rejected.map((v) => [v]))("rejects %p", (value) => {
    expect(type.validate(value).ok).toBe(false)
  })
})

describe("number()", () => {
  test.each([
    [NaN, "NaN"],
    [Infinity, "Infinity"],
    [-Infinity, "-Infinity"],
  ])("%p fails with not_finite", (value, received) => {
    expect(t.number().validate(value)).toEqual({
      ok: false,
      issues: [{ code: "not_finite", path: [], type: { kind: "number" }, expected: "finite number", received }],
    })
  })
})

describe("no coercion", () => {
  test.each([
    [t.number(), "123"],
    [t.string(), 123],
    [t.boolean(), "true"],
    [t.boolean(), 1],
    [t.null(), undefined],
    [t.list(t.string()), "a"],
  ] as [t.Type<unknown>, unknown][])("%# rejects a value that would need converting", (type, value) => {
    const result = type.validate(value)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues[0]!.code).toBe("invalid_type")
  })
})
