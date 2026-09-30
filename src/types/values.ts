// A plain object is one created by an object literal or Object.create(null).
// Arrays, class instances, Dates, Maps and the like are not plain objects.
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}
