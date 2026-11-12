#!/usr/bin/env node
/**
 * Applies the migrations a Supabase database has not run yet.
 *
 * Compares supabase/migrations with the database's migration history
 * (`supabase migration list`), then runs `supabase db push` for the new ones.
 * It refuses to push when more than a handful are pending: that means the
 * history table was never backfilled for migrations pasted into the SQL
 * Editor, and a push would run all of them again.
 *
 *   node scripts/push-migrations.mjs --project-ref <ref>
 *   node scripts/push-migrations.mjs --project-ref <ref> --dry-run
 *
 * Required:
 *   SUPABASE_ACCESS_TOKEN   account token, never committed
 *   SUPABASE_DB_PASSWORD    database password of the target project
 *   SUPABASE_PROJECT_REF    or --project-ref
 *
 * CI passes --skip-if-unconfigured, so an environment without a database
 * password secret is skipped with a warning and migrations stay manual there.
 */
import { spawnSync } from 'node:child_process'
import { appendFileSync, readdirSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveSupabaseCommand } from './deploy-edge-functions.mjs'

export const DEFAULT_MAX_PENDING = 5

const MIGRATION_FILE_PATTERN = /^(\d+)_.+\.sql$/
const PROJECT_REF_PATTERN = /^[a-z]{20}$/
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_DIR, '..')

const HELP = `Apply pending migrations to a Supabase database.

Usage:
  node scripts/push-migrations.mjs [--project-ref <ref>] [--max-pending <n>] [--dry-run]
                                   [--skip-if-unconfigured]

Environment:
  SUPABASE_ACCESS_TOKEN   Personal access token.
  SUPABASE_DB_PASSWORD    Database password of the target project.
  SUPABASE_PROJECT_REF    Target project. Overridden by --project-ref.

--dry-run lists what would be applied without applying it (still connects).
--max-pending refuses to push more than <n> migrations at once (default ${DEFAULT_MAX_PENDING}).
--skip-if-unconfigured exits 0 with a warning when SUPABASE_DB_PASSWORD is not set.
`

export function listLocalMigrations(migrationsDir) {
  let entries
  try {
    entries = readdirSync(migrationsDir)
  } catch (error) {
    if (error && error.code === 'ENOENT') return []
    throw error
  }
  return entries
    .map((name) => name.match(MIGRATION_FILE_PATTERN)?.[1])
    .filter(Boolean)
    .sort()
}

/**
 * Reads the table printed by `supabase migration list`. Each data row holds
 * the local version and the remote version; either may be blank.
 */
export function parseMigrationList(text) {
  const rows = []
  // eslint-disable-next-line no-control-regex
  const plain = text.replace(/\u001b\[[0-9;]*m/g, '')
  for (const line of plain.split(/\r?\n/)) {
    const cells = line.split(/[|│]/).map((cell) => cell.trim())
    if (cells.length < 2) continue
    const [local, remote] = cells
    if (!/^\d*$/.test(local) || !/^\d*$/.test(remote)) continue
    if (local === '' && remote === '') continue
    rows.push({ local, remote })
  }
  return rows
}

export function planPush({ localVersions, rows, maxPending }) {
  const listedLocal = rows.filter((row) => row.local).map((row) => row.local).sort()
  if (rows.length === 0 || listedLocal.join(',') !== localVersions.join(',')) {
    return {
      pending: [],
      errors: [
        'Could not read the migration list from the Supabase CLI, so nothing was pushed.',
      ],
    }
  }

  const pending = rows.filter((row) => row.local && !row.remote).map((row) => row.local)
  const remoteOnly = rows.filter((row) => row.remote && !row.local).map((row) => row.remote)
  const errors = []

  if (remoteOnly.length > 0) {
    errors.push(
      `The database has migrations this branch does not: ${remoteOnly.join(', ')}. ` +
        'Add the files to supabase/migrations, or fix the history with `supabase migration repair`.',
    )
  }
  if (pending.length > maxPending) {
    errors.push(
      `${pending.length} migrations are pending (${pending[0]} to ${pending.at(-1)}), more than the limit of ${maxPending}. ` +
        'If they were already applied by hand, record them first with ' +
        '`supabase migration repair --status applied <versions>` (OPERATIONS.md, Migration deploys). ' +
        'If they really are new, rerun with --max-pending.',
    )
  }
  return { pending, errors }
}

export function parseArgs(argv) {
  const options = {
    dryRun: false,
    help: false,
    skipIfUnconfigured: false,
    projectRef: undefined,
    maxPending: undefined,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') {
      options.help = true
    } else if (arg === '--dry-run') {
      options.dryRun = true
    } else if (arg === '--skip-if-unconfigured') {
      options.skipIfUnconfigured = true
    } else if (arg === '--project-ref' || arg === '--max-pending') {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) throw new Error(`${arg} needs a value`)
      options[arg === '--project-ref' ? 'projectRef' : 'maxPending'] = value
      index += 1
    } else if (arg.startsWith('--project-ref=')) {
      options.projectRef = arg.slice('--project-ref='.length)
    } else if (arg.startsWith('--max-pending=')) {
      options.maxPending = arg.slice('--max-pending='.length)
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  if (options.maxPending === undefined) {
    options.maxPending = DEFAULT_MAX_PENDING
  } else if (/^[1-9]\d*$/.test(options.maxPending)) {
    options.maxPending = Number(options.maxPending)
  } else {
    throw new Error('--max-pending must be a positive integer')
  }
  return options
}

export function runPush({
  argv = process.argv.slice(2),
  env = process.env,
  spawn = defaultSpawn,
  repoRoot = DEFAULT_REPO_ROOT,
  stdout = console.log,
  stderr = console.error,
} = {}) {
  let options
  try {
    options = parseArgs(argv)
  } catch (error) {
    stderr(error.message)
    return 1
  }
  if (options.help) {
    stdout(HELP.trimEnd())
    return 0
  }

  const projectRef = options.projectRef ?? env.SUPABASE_PROJECT_REF ?? ''
  if (!PROJECT_REF_PATTERN.test(projectRef)) {
    stderr('Set SUPABASE_PROJECT_REF or pass --project-ref (20 lowercase letters).')
    return 1
  }

  if (!env.SUPABASE_DB_PASSWORD) {
    if (options.skipIfUnconfigured) {
      const message = `No database password secret for ${projectRef}, so migrations were not applied. Apply them by hand (OPERATIONS.md, Migration deploys).`
      stdout(`::warning title=Migrations not applied::${message}`)
      writeSummary(env, [`## Migrations (skipped)`, '', message])
      return 0
    }
    stderr('Set SUPABASE_DB_PASSWORD. Do not commit the password.')
    return 1
  }
  if (!env.SUPABASE_ACCESS_TOKEN) {
    stderr('Set SUPABASE_ACCESS_TOKEN. Do not commit the token.')
    return 1
  }

  const localVersions = listLocalMigrations(path.join(repoRoot, 'supabase', 'migrations'))
  if (localVersions.length === 0) {
    stderr('No migrations found in supabase/migrations.')
    return 1
  }

  const cli = resolveSupabaseCommand(spawn, env)
  const run = (args, stdio) =>
    spawn(cli.command, [...cli.prefixArgs, ...args], { cwd: repoRoot, env, stdio })

  // The password travels in SUPABASE_DB_PASSWORD, never on the command line.
  const list = run(['migration', 'list', '--project-ref', projectRef], 'pipe')
  if (list.error || list.status !== 0) {
    stderr(`Could not list migrations on ${projectRef}:`)
    stderr((list.error?.message ?? list.stderr ?? '').trim())
    return 1
  }

  const plan = planPush({
    localVersions,
    rows: parseMigrationList(list.stdout ?? ''),
    maxPending: options.maxPending,
  })
  if (plan.errors.length > 0) {
    stderr(`Migration push to ${projectRef} refused:`)
    for (const error of plan.errors) stderr(`  ${error}`)
    return 1
  }

  if (plan.pending.length === 0) {
    stdout(`Migrations on ${projectRef} are up to date (${localVersions.length} applied).`)
    writeSummary(env, ['## Migrations', '', `Project \`${projectRef}\` is up to date.`])
    return 0
  }

  stdout(
    `${options.dryRun ? 'Would apply' : 'Applying'} ${plan.pending.length} migration(s) to ${projectRef}: ${plan.pending.join(', ')}`,
  )
  const push = run(
    ['db', 'push', '--project-ref', projectRef, '--yes', ...(options.dryRun ? ['--dry-run'] : [])],
    'inherit',
  )
  if (push.error) {
    stderr(`Could not run ${cli.command}: ${push.error.message}`)
    return 1
  }
  if (push.status !== 0) {
    stderr('supabase db push failed. Check the log above before retrying.')
    return push.status || 1
  }

  writeSummary(env, [
    `## Migrations (${options.dryRun ? 'dry run' : 'applied'})`,
    '',
    `Project \`${projectRef}\`.`,
    '',
    ...plan.pending.map((version) => `- \`${version}\``),
  ])
  return 0
}

function writeSummary(env, lines) {
  if (!env.GITHUB_STEP_SUMMARY) return
  appendFileSync(env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`)
}

function defaultSpawn(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env,
    encoding: 'utf8',
    stdio: options.stdio ?? 'inherit',
  })
  return {
    status: result.status,
    error: result.error,
    stdout: result.stdout,
    stderr: result.stderr,
  }
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
  process.exit(runPush())
}
