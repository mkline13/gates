// The only module that knows about Zod. It compiles gates descriptors to Zod
// schemas and reports where Zod found problems; gates' own rules (in
// validate.ts) decide what each problem means. Replacing Zod means replacing
// this file.
import { z, type ZodIssue, type ZodTypeAny } from "zod"
import type { Type } from "../core"
import { isPlainObject } from "../values"

export interface Location {
  // The type expected at this location. For an undeclared struct field this
  // is the struct itself, since the field has no type.
  readonly type: Type<unknown>
  readonly value: unknown
  readonly path: readonly (string | number)[]
  // Set when the location is a struct field.
  readonly parent?: {
    readonly struct: Type<unknown>
    readonly object: Record<string, unknown>
    readonly name: string
  }
}

export function findIssueLocations(type: Type<unknown>, value: unknown): Location[] {
  const result = compile(type).safeParse(value)
  if (result.success) return []
  return result.error.issues.flatMap((issue) => locate(type, value, issue))
}

const compiled = new WeakMap<Type<unknown>, ZodTypeAny>()

function compile(type: Type<unknown>): ZodTypeAny {
  const cached = compiled.get(type)
  if (cached) return cached

  const node = type.node
  let schema: ZodTypeAny
  switch (node.kind) {
    case "string":
      schema = z.string()
      break
    case "number":
      schema = z.number().finite()
      break
    case "boolean":
      schema = z.boolean()
      break
    case "null":
      schema = z.null()
      break
    case "list":
      schema = z.array(compile(node.element))
      break
    case "struct": {
      const shape: Record<string, ZodTypeAny> = {}
      for (const [name, field] of Object.entries(node.fields)) {
        shape[name] = field.optional ? compile(field.type).optional() : compile(field.type)
      }
      // Zod's object schema accepts class instances and treats an explicit
      // undefined like absence, so gates adds those rules alongside it. An
      // intersection (not a pipe) keeps both sides' issues, so every problem
      // in a struct is reported together.
      schema = z
        .any()
        .superRefine((input, ctx) => {
          if (!isPlainObject(input)) {
            ctx.addIssue({ code: z.ZodIssueCode.custom })
            return
          }
          for (const name of Object.keys(input)) {
            const field = Object.hasOwn(node.fields, name) ? node.fields[name] : undefined
            if (!field || (field.optional && input[name] === undefined)) {
              ctx.addIssue({ code: z.ZodIssueCode.custom, path: [name] })
            }
          }
        })
        .and(z.object(shape).strict())
      break
    }
  }

  compiled.set(type, schema)
  return schema
}

function locate(root: Type<unknown>, rootValue: unknown, issue: ZodIssue): Location[] {
  let location: Location = { type: root, value: rootValue, path: [] }
  for (const segment of issue.path) {
    location = step(location, segment)
  }
  if (issue.code === z.ZodIssueCode.unrecognized_keys) {
    return issue.keys.map((key) => step(location, key))
  }
  return [location]
}

function step(from: Location, segment: string | number): Location {
  const node = from.type.node
  const path = [...from.path, segment]
  if (node.kind === "struct" && isPlainObject(from.value) && typeof segment === "string") {
    const field = Object.hasOwn(node.fields, segment) ? node.fields[segment] : undefined
    return {
      type: field ? field.type : from.type,
      value: from.value[segment],
      path,
      parent: { struct: from.type, object: from.value, name: segment },
    }
  }
  if (node.kind === "list" && Array.isArray(from.value) && typeof segment === "number") {
    return { type: node.element, value: from.value[segment], path }
  }
  // Zod looked inside a value gates does not treat as a container (a class
  // instance given to a struct). The problem is the container itself.
  return from
}
