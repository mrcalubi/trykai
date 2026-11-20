/**
 * Compares Edge Function secrets between two Supabase projects without
 * showing any value.
 *
 * Used for Supabase region moves (OPERATIONS.md, Supabase region move,
 * step 1.6). Supabase never returns a saved secret, only its
 * SHA-256 digest. This reads both projects' digests through the Management
 * API and says, per name, whether the new project has the same value, a
 * different one, or none. Digests are compared, never printed.
 *
 *   node scripts/compare-secrets.mjs --from <old ref> --to <new ref>
 *
 * Required (shell only, never committed or pasted in chat):
 *   SUPABASE_ACCESS_TOKEN   account token from supabase.com/dashboard/account/tokens
 *
 * Exit code 0 when every secret on the old project is on the new one with the
 * same value, 1 otherwise.
 */
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const API = 'https://api.supabase.com/v1'
const REF_PATTERN = /^[a-z]{20}$/

/** Set by Supabase itself on every project, and different by design. */
export function isBuiltIn(name) {
  return name.startsWith('SUPABASE_')
}

export function parseArgs(argv) {
  const options = { from: '', to: '' }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg !== '--from' && arg !== '--to') throw new Error(`Unknown option: ${arg}`)
    const value = argv[i + 1]
    if (!value || value.startsWith('--')) throw new Error(`${arg} needs a project ref.`)
    i += 1
    options[arg.slice(2)] = value.trim()
  }
  for (const side of ['from', 'to']) {
    if (!REF_PATTERN.test(options[side])) throw new Error(`--${side} must be a project ref (20 lowercase letters).`)
  }
  if (options.from === options.to) throw new Error('--from and --to are the same project.')
  return options
}

/** Per secret name: same, different, missing (on new), extra (only on new). */
export function compareSecrets(fromList, toList) {
  const from = new Map(fromList.filter((s) => !isBuiltIn(s.name)).map((s) => [s.name, s.value]))
  const to = new Map(toList.filter((s) => !isBuiltIn(s.name)).map((s) => [s.name, s.value]))
  const rows = []
  for (const name of [...new Set([...from.keys(), ...to.keys()])].sort()) {
    let status
    if (!to.has(name)) status = 'missing'
    else if (!from.has(name)) status = 'extra'
    else status = from.get(name) === to.get(name) ? 'same' : 'different'
    rows.push({ name, status })
  }
  return rows
}

const LABELS = {
  same: 'same value',
  different: 'DIFFERENT value',
  missing: 'MISSING on new',
  extra: 'only on new',
}

async function listSecrets(fetchImpl, token, ref) {
  const response = await fetchImpl(`${API}/projects/${ref}/secrets`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`${ref}: HTTP ${response.status} ${text.slice(0, 200)}`)
  return JSON.parse(text)
}

export async function runCompare({
  argv = process.argv.slice(2),
  env = process.env,
  fetchImpl = fetch,
  log = console.log,
  logError = console.error,
} = {}) {
  let options
  try {
    options = parseArgs(argv)
  } catch (error) {
    logError(error.message)
    logError('Usage: node scripts/compare-secrets.mjs --from <old ref> --to <new ref>')
    return 1
  }
  const token = String(env.SUPABASE_ACCESS_TOKEN ?? '').trim()
  if (!token) {
    logError('Set SUPABASE_ACCESS_TOKEN in this shell first.')
    return 1
  }
  let rows
  try {
    const [fromList, toList] = await Promise.all([
      listSecrets(fetchImpl, token, options.from),
      listSecrets(fetchImpl, token, options.to),
    ])
    rows = compareSecrets(fromList, toList)
  } catch (error) {
    logError(`Could not read secrets: ${error.message}`)
    return 1
  }
  log(`Edge Function secrets: ${options.from} (old) → ${options.to} (new)`)
  const width = Math.max(0, ...rows.map((row) => row.name.length))
  for (const row of rows) log(`  ${row.name.padEnd(width)}  ${LABELS[row.status]}`)
  const problems = rows.filter((row) => row.status === 'missing' || row.status === 'different')
  log(problems.length ? `\n${problems.length} to fix.` : '\nAll secrets match.')
  return problems.length ? 1 : 0
}

function invokedDirectly() {
  const entry = process.argv[1]
  if (!entry) return false
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}

if (invokedDirectly()) {
  process.exit(await runCompare())
}
