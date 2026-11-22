/**
 * Compares Supabase Auth settings between two projects, and optionally copies
 * them from the old one to the new one.
 *
 * Used for Supabase region moves (OPERATIONS.md, Supabase region move,
 * step 1.4). Auth settings live outside Postgres, so the database
 * restore does not bring them. This reads both projects' Auth config through
 * the Management API, lists every setting that differs, and with --apply
 * writes the old values onto the new project.
 *
 * Never copied, never printed: any setting whose name looks like a secret
 * (password, secret, token, key). Those are listed by name only, for setting
 * by hand. A value that names the old project ref is copied with the new ref.
 *
 *   node scripts/copy-auth-config.mjs --from <old ref> --to <new ref>
 *   node scripts/copy-auth-config.mjs --from <old ref> --to <new ref> --apply
 *
 * Required (shell only, never committed or pasted in chat):
 *   SUPABASE_ACCESS_TOKEN   account token from supabase.com/dashboard/account/tokens
 *
 * It only ever reads the old project. Exit code 1 if anything could not be
 * read or written.
 */
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const API = 'https://api.supabase.com/v1'
const REF_PATTERN = /^[a-z]{20}$/
// smtp_pass, external_*_secret, sms_twilio_auth_token, sms_*_api_key,
// sms_messagebird_access_key, security_captcha_secret, hook_*_secrets. Not
// settings that merely mention tokens (refresh_token_rotation_enabled).
const SECRET_PATTERN = /(_secrets?|_pass|_password|_auth_token|_api_key|_access_key|_private_key)$/i

const HELP = `Compare (and optionally copy) Supabase Auth settings between two projects.

Usage:
  node scripts/copy-auth-config.mjs --from <old ref> --to <new ref> [--apply]

Environment:
  SUPABASE_ACCESS_TOKEN   account token (supabase.com/dashboard/account/tokens)

Without --apply it only lists the differences. Secrets are never copied or shown.
`

export function parseArgs(argv) {
  const options = { from: '', to: '', apply: false, help: false }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--apply') options.apply = true
    else if (arg === '--help' || arg === '-h') options.help = true
    else if (arg === '--from' || arg === '--to') {
      const value = argv[i + 1]
      if (!value || value.startsWith('--')) throw new Error(`${arg} needs a project ref.`)
      i += 1
      options[arg.slice(2)] = value.trim()
    } else throw new Error(`Unknown option: ${arg}`)
  }
  if (options.help) return options
  for (const side of ['from', 'to']) {
    if (!REF_PATTERN.test(options[side])) throw new Error(`--${side} must be a project ref (20 lowercase letters).`)
  }
  if (options.from === options.to) throw new Error('--from and --to are the same project.')
  return options
}

/**
 * A secret is text. Switches and numbers that happen to end in a secret-like
 * word (security_update_password_require_current_password) are settings.
 */
export function isSecretSetting(name, value) {
  if (typeof value === 'boolean' || typeof value === 'number') return false
  return SECRET_PATTERN.test(name)
}

function swapRef(value, fromRef, toRef) {
  if (typeof value === 'string') return value.split(fromRef).join(toRef)
  if (value && typeof value === 'object') return JSON.parse(JSON.stringify(value).split(fromRef).join(toRef))
  return value
}

/**
 * Splits the differences into what can be copied and the secrets to set by
 * hand. `copy` holds the old values, with the old ref swapped for the new one.
 */
export function diffConfigs(fromConfig, toConfig, fromRef, toRef) {
  const copy = {}
  const secrets = []
  const refSwapped = []
  const keys = [...new Set([...Object.keys(fromConfig), ...Object.keys(toConfig)])].sort()
  for (const key of keys) {
    if (!(key in fromConfig)) continue
    if (isSecretSetting(key, fromConfig[key] ?? toConfig[key])) {
      const hasValue = fromConfig[key] !== null && fromConfig[key] !== '' && fromConfig[key] !== undefined
      if (hasValue) secrets.push(key)
      continue
    }
    const wanted = swapRef(fromConfig[key], fromRef, toRef)
    if (JSON.stringify(wanted) === JSON.stringify(toConfig[key] ?? null)) continue
    if (JSON.stringify(wanted) !== JSON.stringify(fromConfig[key])) refSwapped.push(key)
    copy[key] = wanted
  }
  return { copy, secrets, refSwapped }
}

/** Short, safe description of a value for the listing. */
export function describe(value) {
  if (value === null || value === undefined) return 'empty'
  if (typeof value === 'string') {
    const oneLine = value.replace(/\s+/g, ' ')
    return oneLine.length > 60 ? `"${oneLine.slice(0, 57)}…" (${value.length} chars)` : `"${oneLine}"`
  }
  return JSON.stringify(value)
}

async function request(fetchImpl, token, method, ref, body) {
  const response = await fetchImpl(`${API}/projects/${ref}/config/auth`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await response.text()
  if (!response.ok) {
    let message = text
    try {
      message = JSON.parse(text).message ?? text
    } catch {
      // keep the raw text
    }
    throw new Error(`${method} ${ref}: HTTP ${response.status} ${String(message).slice(0, 200)}`)
  }
  return text ? JSON.parse(text) : {}
}

export async function runCopyAuth({
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
    logError('Run with --help for usage.')
    return 1
  }
  if (options.help) {
    log(HELP)
    return 0
  }
  const token = String(env.SUPABASE_ACCESS_TOKEN ?? '').trim()
  if (!token) {
    logError('Set SUPABASE_ACCESS_TOKEN in this shell first.')
    return 1
  }

  let fromConfig
  let toConfig
  try {
    ;[fromConfig, toConfig] = await Promise.all([
      request(fetchImpl, token, 'GET', options.from),
      request(fetchImpl, token, 'GET', options.to),
    ])
  } catch (error) {
    logError(`Could not read Auth settings: ${error.message}`)
    return 1
  }

  const { copy, secrets, refSwapped } = diffConfigs(fromConfig, toConfig, options.from, options.to)
  const keys = Object.keys(copy)
  log(`Auth settings: ${options.from} (old) → ${options.to} (new)`)
  if (!keys.length) log('No differences outside secrets.')
  for (const key of keys) {
    const note = refSwapped.includes(key) ? '  (old ref swapped for new)' : ''
    log(`  ${key}: ${describe(toConfig[key])} → ${describe(copy[key])}${note}`)
  }
  if (secrets.length) {
    log('')
    log('Set on the old project, never copied (check by hand on the new one):')
    for (const key of secrets) log(`  ${key}`)
  }

  if (!options.apply || !keys.length) {
    if (!options.apply && keys.length) log(`\n${keys.length} settings differ. Run again with --apply to copy them.`)
    return 0
  }

  log('')
  try {
    await request(fetchImpl, token, 'PATCH', options.to, copy)
    log(`Copied ${keys.length} settings.`)
    return 0
  } catch (error) {
    log(`One update was refused (${error.message}). Trying each setting on its own.`)
  }

  const failed = []
  for (const key of keys) {
    try {
      await request(fetchImpl, token, 'PATCH', options.to, { [key]: copy[key] })
    } catch (error) {
      failed.push({ key, message: error.message })
    }
  }
  log(`Copied ${keys.length - failed.length} of ${keys.length} settings.`)
  if (failed.length) {
    logError('Not copied (set these in the dashboard, or fix the cause and run again):')
    for (const { key, message } of failed) logError(`  ${key}: ${message}`)
    return 1
  }
  return 0
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
  process.exit(await runCopyAuth())
}
