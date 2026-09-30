import { type Field, internal, isOptional, isType, Optional, Type } from "./core"

type Simplify<T> = { [K in keyof T]: T[K] } & {}

export type StructFields = Readonly<Record<string, Type<unknown> | Optional<unknown>>>

type RequiredKeys<F extends StructFields> = {
  [K in keyof F]: F[K] extends Optional<unknown> ? never : K
}[keyof F]

type OptionalKeys<F extends StructFields> = {
  [K in keyof F]: F[K] extends Optional<unknown> ? K : never
}[keyof F]

type ValueOf<F> = F extends Type<infer V> ? V : F extends Optional<infer V> ? V : never

export type StructValue<F extends StructFields> = Simplify<
  { readonly [K in RequiredKeys<F>]: ValueOf<F[K]> } & {
    readonly [K in OptionalKeys<F>]?: ValueOf<F[K]>
  }
>

// A plain object with exactly the declared fields. See spec/01-types.md,
// "Struct semantics", for the full rules.
export function struct<const F extends StructFields>(fields: F): Type<StructValue<F>> {
  if (typeof fields !== "object" || fields === null || Array.isArray(fields)) {
    throw new TypeError("struct() expects an object mapping field names to protocol types")
  }

  // Copy the definition so later changes to the caller's object cannot
  // change the type.
  const copy: Record<string, Field> = Object.create(null)
  for (const name of Object.keys(fields)) {
    if (name === "__proto__") {
      // Too easy to mishandle across JavaScript APIs and validators.
      throw new TypeError('struct() field name "__proto__" is not allowed')
    }
    const field = fields[name]
    if (isType(field)) {
      copy[name] = Object.freeze({ type: field, optional: false })
    } else if (isOptional(field)) {
      copy[name] = Object.freeze({ type: field.type, optional: true })
    } else {
      throw new TypeError(`struct() field "${name}" is not a gates protocol type`)
    }
  }

  return new Type(internal, { kind: "struct", fields: Object.freeze(copy) }) as Type<
    StructValue<F>
  >
}

// An array whose every element satisfies the element type.
export function list<T>(element: Type<T>): Type<readonly T[]> {
  if (!isType(element)) {
    throw new TypeError("list() expects a gates protocol type")
  }
  return new Type(internal, { kind: "list", element }) as Type<readonly T[]>
}

// A struct field that may be absent. When present it must satisfy the inner
// type; an explicit `undefined` is not the same as absence and is rejected.
export function optional<T>(type: Type<T>): Optional<T> {
  if (!isType(type)) {
    throw new TypeError("optional() expects a gates protocol type")
  }
  return new Optional(internal, type)
}
