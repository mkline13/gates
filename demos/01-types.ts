// Demo 01: one schema, two representations.
//
//   bun run demos/01-types.ts
//
// A single definition gives a TypeScript type (for the compiler) and a
// runtime validator (for the boundary). See spec/01-types.md.
import * as t from "../src/types"

const User = t.struct({
  name: t.string(),
  email: t.string(),
  age: t.number(),
  nickname: t.optional(t.string()),
  tags: t.list(t.string()),
})

// The compile-time type, derived from the same definition:
//   { readonly name: string; readonly email: string; readonly age: number;
//     readonly nickname?: string; readonly tags: readonly string[] }
type User = t.Infer<typeof User>

function greet(user: User): string {
  return `Hello, ${user.nickname ?? user.name}!`
}

function show(label: string, input: unknown) {
  console.log(`\n── ${label}`)
  console.log("input:", input)
  const result = User.validate(input)
  if (result.ok) {
    console.log("✓ valid →", greet(result.value))
  } else {
    console.log("✗ invalid")
    for (const issue of result.issues) {
      const where = ["User", ...issue.path].join(".")
      console.log(`  ${where}  [${issue.code}]  expected: ${issue.expected}  received: ${issue.received}`)
    }
  }
}

console.log("── Inspection (derived from the schema itself)")
console.log(JSON.stringify(User.inspect(), null, 2))

show("A valid user", { name: "Alice", email: "alice@example.com", age: 36, tags: ["admin"] })

show("Optional field present", {
  name: "Robert",
  email: "bob@example.com",
  age: 41,
  nickname: "Bob",
  tags: [],
})

show("No coercion: \"36\" is not a number", {
  name: "Alice",
  email: "alice@example.com",
  age: "36",
  tags: [],
})

show("NaN is not a finite number", { name: "Alice", email: "alice@example.com", age: NaN, tags: [] })

show("Absent vs undefined vs null are different", {
  name: "Alice",
  email: null,
  age: 36,
  nickname: undefined,
  tags: [],
})

show("Unknown and missing fields, bad list element", {
  name: "Mallory",
  age: 20,
  tags: ["ok", 7],
  isAdmin: true,
})

console.log("\n── Mutation after validation")
const input = { name: "Alice", email: "alice@example.com", age: 36, tags: ["admin"] }
const result = User.validate(input)
if (result.ok) {
  const user = result.value
  input.tags.push("root")
  console.log("changing the input afterwards does not reach the validated copy:", user.tags)
  try {
    ;(user.tags as string[]).push("root")
  } catch (error) {
    console.log("writing to the validated value throws:", (error as Error).constructor.name)
  }
  const renamed = { ...user, nickname: "Al" }
  console.log("a changed copy must pass validation again:", User.validate(renamed).ok)
}

console.log("\n── Identity")
const Other = t.struct({
  name: t.string(),
  email: t.string(),
  age: t.number(),
  nickname: t.optional(t.string()),
  tags: t.list(t.string()),
})
console.log("an identical definition is a different type:", Other !== User)
console.log(
  "…but inspects the same:",
  JSON.stringify(Other.inspect()) === JSON.stringify(User.inspect()),
)
