import { describe, expect, test } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"

// Allowed dependency direction: types ← runtime ← http-server.
// Each module lists the sibling modules it must never import.
const forbidden: Record<string, string[]> = {
  types: ["runtime", "http-server"],
  runtime: ["http-server"],
}

const srcDir = resolve(import.meta.dir, "../../src")

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name))
}

function importedModules(file: string): string[] {
  const code = readFileSync(file, "utf8")
  const specifiers = [...code.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)]
    .map((match) => match[1]!)
    .filter((specifier) => specifier.startsWith("."))

  return specifiers.map((specifier) => {
    const target = relative(srcDir, resolve(dirname(file), specifier))
    return target.split(/[\\/]/)[0]!
  })
}

describe("module dependency direction", () => {
  for (const [module, banned] of Object.entries(forbidden)) {
    test(`src/${module} does not import ${banned.join(" or ")}`, () => {
      const violations = sourceFiles(join(srcDir, module)).flatMap((file) =>
        importedModules(file)
          .filter((target) => banned.includes(target))
          .map((target) => `${relative(srcDir, file)} → ${target}`),
      )
      expect(violations).toEqual([])
    })
  }
})
