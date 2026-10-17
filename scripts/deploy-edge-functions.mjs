#!/usr/bin/env node
/**
 * Deploys every local Supabase Edge Function in one CLI call.
 *
 * Discovers supabase/functions/<name>/index.ts, skips `_shared` and any other
 * directory that is not a function slug, and refuses to deploy unless each
 * slug has a [functions.<name>] block in supabase/config.toml. JWT
 * verification, import maps, and entrypoints come from that file. The CLI
 * bundles `_shared/` into each function, so a shared edit has to ship with
 * every function. This script always deploys the full set.
 *
 *   node scripts/deploy-edge-functions.mjs --project-ref <ref>
 *   node scripts/deploy-edge-functions.mjs --dry-run
 *
 * Required for a real deploy:
 *   SUPABASE_ACCESS_TOKEN   account token, never committed
 *   SUPABASE_PROJECT_REF    or --project-ref
 *
 * CI passes the project ref. Pull requests only run --dry-run.
 */
import { spawnSync } from 'node:child_process'
import { appendFileSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const SUPABASE_CLI_VERSION = '2.121.0'
export const DEFAULT_JOBS = 4
export const MAX_JOBS = 20

const SLUG_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*$/
const PROJECT_REF_PATTERN = /^[a-z]{20}$/
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_DIR, '..')

const HELP = `Deploy every local Supabase Edge Function.

Usage:
  node scripts/deploy-edge-functions.mjs [--project-ref <ref>] [--jobs <n>] [--dry-run]

Environment:
  SUPABASE_ACCESS_TOKEN   Personal access token. Required unless --dry-run.
  SUPABASE_PROJECT_REF    Target project. Overridden by --project-ref.

--dry-run checks that every function directory matches config.toml and prints
the deploy command. A real deploy runs:
  supabase functions deploy <names...> --project-ref <ref> --use-api --jobs <n>

Staging project ref: hzgybclfvpuxkmytdoos
`

export function discoverFunctionSlugs(functionsDir) {
  let entries
  try {
    entries = readdirSync(functionsDir)
  } catch (error) {
    if (error && error.code === 'ENOENT') return []
    throw error
  }

  const slugs = []
  for (const name of entries) {
    if (!SLUG_PATTERN.test(name)) continue
    const dir = path.join(functionsDir, name)
    let info
    try {
      info = statSync(dir)
    } catch {
      continue
    }
    if (!info.isDirectory()) continue
    if (!isFile(path.join(dir, 'index.ts'))) continue
    slugs.push(name)
  }
  slugs.sort((left, right) => left.localeCompare(right))
  return slugs
}

export function parseFunctionSections(configText) {
  const sections = new Map()
  const duplicates = []
  let current = null

  for (const line of configText.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue

    const header = trimmed.match(/^\[functions\.([A-Za-z][A-Za-z0-9_-]*)\]$/)
    if (header) {
      current = header[1]
      if (sections.has(current)) duplicates.push(current)
      else sections.set(current, {})
      continue
    }
    if (trimmed.startsWith('[')) {
      current = null
      continue
    }
    if (!current) continue

    const match = trimmed.match(/^([A-Za-z0-9_]+)\s*=\s*(.*)$/)
    if (!match) continue
    sections.get(current)[match[1]] = unquote(stripInlineComment(match[2]))
  }

  return { sections, duplicates }
}

export function planDeploy({ functionsDir, configPath }) {
  const slugs = discoverFunctionSlugs(functionsDir)
  const configText = readFileSync(configPath, 'utf8')
  const { sections, duplicates } = parseFunctionSections(configText)
  const supabaseDir = path.dirname(configPath)
  const errors = []
  const selected = []
  const skipped = []

  for (const slug of duplicates) {
    errors.push(`${slug}: [functions.${slug}] is declared more than once`)
  }

  for (const slug of slugs) {
    const section = sections.get(slug)
    if (!section) {
      errors.push(
        `${slug}: supabase/functions/${slug}/index.ts has no [functions.${slug}] block in config.toml`,
      )
      continue
    }
    const sectionErrors = validateSection(slug, section, supabaseDir)
    errors.push(...sectionErrors)
    if (sectionErrors.length > 0) continue
    if (section.enabled === 'false') skipped.push(slug)
    else selected.push(slug)
  }

  for (const slug of [...sections.keys()].sort((left, right) => left.localeCompare(right))) {
    if (!slugs.includes(slug)) {
      errors.push(
        `${slug}: listed in config.toml but supabase/functions/${slug}/index.ts does not exist`,
      )
    }
  }

  return { slugs: selected, skipped, errors }
}

export function buildDeployArgs({ slugs, projectRef, jobs }) {
  return [
    'functions',
    'deploy',
    ...slugs,
    '--project-ref',
    projectRef,
    '--use-api',
    '--jobs',
    String(jobs),
  ]
}

export function parseArgs(argv) {
  const options = {
    dryRun: false,
    help: false,
    projectRef: undefined,
    jobs: undefined,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') {
      options.help = true
    } else if (arg === '--dry-run') {
      options.dryRun = true
    } else if (arg === '--project-ref') {
      options.projectRef = readValue(argv, index, arg)
      index += 1
    } else if (arg.startsWith('--project-ref=')) {
      options.projectRef = arg.slice('--project-ref='.length)
    } else if (arg === '--jobs') {
      options.jobs = readValue(argv, index, arg)
      index += 1
    } else if (arg.startsWith('--jobs=')) {
      options.jobs = arg.slice('--jobs='.length)
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return options
}

export function resolveSupabaseCommand(spawn, env) {
  if (env.SUPABASE_CLI) {
    return { command: env.SUPABASE_CLI, prefixArgs: [] }
  }
  const probe = spawn('supabase', ['--version'], { stdio: 'pipe' })
  const versionText = `${probe.stdout ?? ''}\n${probe.stderr ?? ''}`
  if (probe.status === 0 && !probe.error && cliVersionMatches(versionText)) {
    return { command: 'supabase', prefixArgs: [] }
  }
  return {
    command: 'npx',
    prefixArgs: ['--yes', `supabase@${SUPABASE_CLI_VERSION}`],
  }
}

export function runDeploy({
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

  const functionsDir = path.join(repoRoot, 'supabase', 'functions')
  const configPath = path.join(repoRoot, 'supabase', 'config.toml')
  let plan
  try {
    plan = planDeploy({ functionsDir, configPath })
  } catch (error) {
    stderr(error.message)
    return 1
  }

  if (plan.errors.length > 0) {
    stderr('Edge function deploy check failed:')
    for (const error of plan.errors) stderr(`  ${error}`)
    return 1
  }
  if (plan.slugs.length === 0) {
    stderr('No enabled Edge Functions to deploy.')
    return 1
  }

  const projectRef = options.projectRef ?? env.SUPABASE_PROJECT_REF ?? ''
  if (projectRef && !PROJECT_REF_PATTERN.test(projectRef)) {
    stderr(`Invalid Supabase project ref: ${projectRef}`)
    return 1
  }

  let jobs
  try {
    jobs = resolveJobs(options.jobs)
  } catch (error) {
    stderr(error.message)
    return 1
  }

  const commandArgs = projectRef
    ? buildDeployArgs({ slugs: plan.slugs, projectRef, jobs })
    : null

  stdout(
    `${options.dryRun ? 'Would deploy' : 'Deploying'} ${plan.slugs.length} edge functions${
      projectRef ? ` to ${projectRef}` : ''
    }:`,
  )
  for (const slug of plan.slugs) stdout(`  ${slug}`)
  if (plan.skipped.length > 0) {
    stdout(`Skipping disabled functions: ${plan.skipped.join(', ')}`)
  }
  writeSummary(env, {
    mode: options.dryRun ? 'dry run' : 'deploy',
    projectRef,
    slugs: plan.slugs,
    skipped: plan.skipped,
  })

  if (options.dryRun) {
    if (commandArgs) stdout(`Command: supabase ${commandArgs.join(' ')}`)
    else stdout('Project ref not set. Pass --project-ref or SUPABASE_PROJECT_REF to deploy.')
    return 0
  }

  if (!projectRef) {
    stderr('Set SUPABASE_PROJECT_REF or pass --project-ref. Staging is hzgybclfvpuxkmytdoos.')
    return 1
  }
  if (!env.SUPABASE_ACCESS_TOKEN) {
    stderr('Set SUPABASE_ACCESS_TOKEN. Do not commit the token.')
    return 1
  }

  const cli = resolveSupabaseCommand(spawn, env)
  const args = [...cli.prefixArgs, ...commandArgs]
  stdout(`Command: ${cli.command} ${args.join(' ')}`)
  const result = spawn(cli.command, args, {
    cwd: repoRoot,
    env,
    stdio: 'inherit',
  })
  if (result.error) {
    stderr(`Could not run ${cli.command}: ${result.error.message}`)
    return 1
  }
  return result.status === 0 ? 0 : result.status || 1
}

function validateSection(slug, section, supabaseDir) {
  const errors = []
  if (section.verify_jwt !== 'true' && section.verify_jwt !== 'false') {
    errors.push(`${slug}: [functions.${slug}] must set verify_jwt to true or false`)
  }
  if (!section.import_map) {
    errors.push(`${slug}: [functions.${slug}] must set import_map`)
  } else if (!isFile(resolveConfigFile(supabaseDir, section.import_map))) {
    errors.push(`${slug}: import_map file not found (${section.import_map})`)
  }
  if (!section.entrypoint) {
    errors.push(`${slug}: [functions.${slug}] must set entrypoint`)
  } else if (!isFile(resolveConfigFile(supabaseDir, section.entrypoint))) {
    errors.push(`${slug}: entrypoint file not found (${section.entrypoint})`)
  }
  if (section.enabled !== undefined && section.enabled !== 'true' && section.enabled !== 'false') {
    errors.push(`${slug}: enabled must be true or false`)
  }
  return errors
}

function resolveConfigFile(supabaseDir, value) {
  if (path.isAbsolute(value)) return value
  return path.resolve(supabaseDir, value)
}

function resolveJobs(value) {
  if (value === undefined) return DEFAULT_JOBS
  if (!/^[1-9]\d*$/.test(value)) {
    throw new Error(`--jobs must be an integer from 1 to ${MAX_JOBS}`)
  }
  const jobs = Number(value)
  if (jobs > MAX_JOBS) throw new Error(`--jobs must be an integer from 1 to ${MAX_JOBS}`)
  return jobs
}

function readValue(argv, index, flag) {
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${flag} needs a value`)
  return value
}

function stripInlineComment(value) {
  let quote = null
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]
    if (quote) {
      if (character === quote) quote = null
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
      continue
    }
    if (character === '#') return value.slice(0, index).trim()
  }
  return value.trim()
}

function unquote(value) {
  if (
    (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
    (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
  ) {
    return value.slice(1, -1)
  }
  return value
}

function isFile(filePath) {
  try {
    return statSync(filePath).isFile()
  } catch {
    return false
  }
}

function writeSummary(env, { mode, projectRef, slugs, skipped }) {
  if (!env.GITHUB_STEP_SUMMARY) return
  const lines = [
    `## Edge functions (${mode})`,
    '',
    projectRef ? `Project \`${projectRef}\`.` : 'Project ref not set.',
    '',
    ...slugs.map((slug) => `- \`${slug}\``),
  ]
  if (skipped.length > 0) {
    lines.push('', 'Skipped because enabled = false:', ...skipped.map((slug) => `- \`${slug}\``))
  }
  appendFileSync(env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`)
}

function cliVersionMatches(text) {
  const escaped = SUPABASE_CLI_VERSION.replaceAll('.', '\\.')
  return new RegExp(`(?:^|\\s)${escaped}(?:\\s|$)`).test(text)
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
  process.exit(runDeploy())
}
