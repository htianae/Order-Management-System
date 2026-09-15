import { readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

function testFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return testFiles(path)
    return entry.name.endsWith('.test.ts') ? [path] : []
  })
}

const files = ['backend/src', 'frontend/src'].flatMap((directory) => testFiles(join(root, directory))).sort()
const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', ...files], {
  cwd: root,
  stdio: 'inherit'
})

if (result.error) console.error(result.error.message)
process.exit(result.status ?? 1)
