import { describe, expect, test } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"

// Zod is an implementation detail of the type system (spec/01-types.md §2.5).
// Only the backend adapter may import it; application-facing code and the
// runtime must go through the gates type API.
const root = resolve(import.meta.dir, "../..")
const allowed = join("src", "types", "backend")

function sourceFiles(dir: string): string[] {
  return readdirSync(join(root, dir), { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
    .map((entry) => relative(root, join(entry.parentPath, entry.name)))
}

describe("validation library isolation", () => {
  test(`only ${allowed}/ imports zod`, () => {
    const violations = [...sourceFiles("src"), ...sourceFiles("demos")].filter(
      (file) =>
        !file.startsWith(allowed) &&
        /(?:from|import)\s*\(?\s*["']zod(?:\/[^"']*)?["']/.test(readFileSync(join(root, file), "utf8")),
    )
    expect(violations).toEqual([])
  })
})
