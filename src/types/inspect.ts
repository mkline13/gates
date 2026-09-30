import type { Type } from "./core"

export type Inspection =
  | { readonly kind: "string" }
  | { readonly kind: "number" }
  | { readonly kind: "boolean" }
  | { readonly kind: "null" }
  | { readonly kind: "list"; readonly element: Inspection }
  | { readonly kind: "struct"; readonly fields: { readonly [name: string]: FieldInspection } }

export type FieldInspection = Inspection | { readonly kind: "optional"; readonly type: Inspection }

// A machine-readable, frozen description derived from the descriptor itself.
export function inspect(type: Type<unknown>): Inspection {
  const node = type.node
  switch (node.kind) {
    case "string":
    case "number":
    case "boolean":
    case "null":
      return Object.freeze({ kind: node.kind })
    case "list":
      return Object.freeze({ kind: "list", element: inspect(node.element) })
    case "struct": {
      const fields: Record<string, FieldInspection> = {}
      for (const [name, field] of Object.entries(node.fields)) {
        const described = inspect(field.type)
        Object.defineProperty(fields, name, {
          value: field.optional ? Object.freeze({ kind: "optional", type: described }) : described,
          enumerable: true,
        })
      }
      return Object.freeze({ kind: "struct", fields: Object.freeze(fields) })
    }
  }
}
