import { describe, expect, test } from "bun:test"
import * as t from "../../src/types"

const Team = t.struct({
  name: t.string(),
  members: t.list(t.struct({ email: t.string() })),
})

const input = () => ({ name: "Core", members: [{ email: "a@x" }, { email: "b@x" }] })

describe("mutation and trust: validation returns a deep-frozen copy", () => {
  test("the validated value is a copy, not the input", () => {
    const original = input()
    const result = Team.validate(original)
    if (!result.ok) throw new Error("expected valid")
    expect(result.value).toEqual(original)
    expect(result.value).not.toBe(original)
    expect(result.value.members).not.toBe(original.members)
    expect(result.value.members[0]).not.toBe(original.members[0])
  })

  test("the validated value is frozen all the way down", () => {
    const result = Team.validate(input())
    if (!result.ok) throw new Error("expected valid")
    expect(Object.isFrozen(result.value)).toBe(true)
    expect(Object.isFrozen(result.value.members)).toBe(true)
    expect(Object.isFrozen(result.value.members[0])).toBe(true)
  })

  test("writes to the validated value throw", () => {
    const result = Team.validate(input())
    if (!result.ok) throw new Error("expected valid")
    const value = result.value as { name: string; members: { email: string }[] }
    expect(() => {
      value.name = "Other"
    }).toThrow(TypeError)
    expect(() => {
      value.members.push({ email: "c@x" })
    }).toThrow(TypeError)
    expect(() => {
      value.members[0]!.email = "evil"
    }).toThrow(TypeError)
  })

  test("the caller's input is not frozen or changed", () => {
    const original = input()
    Team.validate(original)
    expect(Object.isFrozen(original)).toBe(false)
    original.name = "Changed"
    expect(original.name).toBe("Changed")
  })

  test("changing the input after validation does not change the validated value", () => {
    const original = input()
    const result = Team.validate(original)
    if (!result.ok) throw new Error("expected valid")
    original.members[0]!.email = "evil"
    original.members.push({ email: "c@x" })
    expect(result.value.members).toEqual([{ email: "a@x" }, { email: "b@x" }])
  })

  test("each field is read once, so a getter cannot pass validation with one value and deliver another", () => {
    let reads = 0
    const tricky = {
      get name() {
        reads++
        return reads === 1 ? "Core" : (42 as unknown as string)
      },
      members: [],
    }
    const result = Team.validate(tricky)
    expect(reads).toBe(1)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.name).toBe("Core")
      expect(Object.getOwnPropertyDescriptor(result.value, "name")?.get).toBeUndefined()
    }
  })

  test("updating a value means building a new one, which must be validated again", () => {
    const result = Team.validate(input())
    if (!result.ok) throw new Error("expected valid")
    const renamed = { ...result.value, name: 7 }
    expect(Team.validate(renamed).ok).toBe(false)
  })
})
