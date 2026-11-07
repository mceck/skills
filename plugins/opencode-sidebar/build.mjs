import { readFile, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"

import { transformSolidSource } from "./node_modules/@opentui/solid/scripts/solid-transform.js"

const source = fileURLToPath(new URL("./tui.tsx", import.meta.url))
const target = fileURLToPath(new URL("./tui.js", import.meta.url))

const code = await readFile(source, "utf8")
const output = await transformSolidSource(code, {
  filename: source,
  moduleName: "@opentui/solid",
})

await writeFile(target, output)
console.log(`built ${target}`)
