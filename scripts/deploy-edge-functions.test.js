import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_JOBS,
  SUPABASE_CLI_VERSION,
  buildDeployArgs,
  discoverFunctionSlugs,
  parseArgs,
  planDeploy,
  resolveSupabaseCommand,
  runDeploy,
} from './deploy-edge-functions.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const STAGING_REF = 'hzgybclfvpuxkmytdoos'
const FUNCTIONS = [
  'abandon-checkout',
  'admin-cancel-booking',
  'admin-verifications',
  'cancel-booking',
  'create-account-link',
  'create-connect-account',
  'create-identity-session',
  'create-payment-intent',
  'notify-verification-pending',
  'purge-verification-docs',
  'release-payout',
  'stripe-webhook',
]

describe('this repo', () => {
  it('plans every enabled function and leaves _shared out', () => {
    const plan = planDeploy({
      functionsDir: path.join(repoRoot, 'supabase', 'functions'),
      configPath: path.join(repoRoot, 'supabase', 'config.toml'),
    })

    expect(plan.errors).toEqual([])
    expect(plan.skipped).toEqual([])
    expect(plan.slugs).toEqual(FUNCTIONS)
    expect(plan.slugs).not.toContain('_shared')
  })

  it('pins the CLI version used by CI', () => {
    const workflow = readFileSync(path.join(repoRoot, '.github', 'workflows', 'ci.yml'), 'utf8')
    expect(workflow).toContain(`version: ${SUPABASE_CLI_VERSION}`)
    expect(workflow).toContain('node scripts/deploy-edge-functions.mjs --dry-run')
    expect(workflow).toContain('node scripts/deploy-edge-functions.mjs')
  })
})

describe('discoverFunctionSlugs', () => {
  const roots = []

  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
  })

  it('keeps slug directories with index.ts and skips shared modules', () => {
    const root = makeRoot(roots)
    writeFunction(root, 'pay')
    writeFunction(root, '_shared')
    mkdirSync(path.join(root, 'notes'))
    writeFileSync(path.join(root, 'README.md'), 'nope')

    expect(discoverFunctionSlugs(root)).toEqual(['pay'])
  })

  it('returns an empty list when the functions directory is missing', () => {
    expect(discoverFunctionSlugs(path.join(tmpdir(), 'missing-functions-dir'))).toEqual([])
  })
})

describe('planDeploy', () => {
  const roots = []

  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
  })

  it('skips a disabled function and reports config drift', () => {
    const supabaseDir = path.join(makeRoot(roots), 'supabase')
    const functionsDir = path.join(supabaseDir, 'functions')
    writeFunction(functionsDir, 'alpha')
    writeFunction(functionsDir, 'beta')
    writeFunction(functionsDir, 'gamma')
    writeFileSync(
      path.join(supabaseDir, 'config.toml'),
      `
[functions.alpha]
enabled = true
verify_jwt = false
import_map = "./functions/alpha/deno.json"
entrypoint = "./functions/alpha/index.ts"

[functions.beta]
enabled = false
verify_jwt = true
import_map = "./functions/beta/deno.json"
entrypoint = "./functions/beta/index.ts"

[functions.missing]
enabled = true
verify_jwt = false
import_map = "./functions/missing/deno.json"
entrypoint = "./functions/missing/index.ts"
`,
    )

    const plan = planDeploy({
      functionsDir,
      configPath: path.join(supabaseDir, 'config.toml'),
    })

    expect(plan.slugs).toEqual(['alpha'])
    expect(plan.skipped).toEqual(['beta'])
    expect(plan.errors).toEqual([
      'gamma: supabase/functions/gamma/index.ts has no [functions.gamma] block in config.toml',
      'missing: listed in config.toml but supabase/functions/missing/index.ts does not exist',
    ])
  })

  it('reports a missing import map file', () => {
    const supabaseDir = path.join(makeRoot(roots), 'supabase')
    const functionsDir = path.join(supabaseDir, 'functions')
    mkdirSync(path.join(functionsDir, 'alpha'), { recursive: true })
    writeFileSync(path.join(functionsDir, 'alpha', 'index.ts'), 'export {}\n')
    writeFileSync(
      path.join(supabaseDir, 'config.toml'),
      `
[functions.alpha]
verify_jwt = false
import_map = "./functions/alpha/deno.json"
entrypoint = "./functions/alpha/index.ts"
`,
    )

    const plan = planDeploy({
      functionsDir,
      configPath: path.join(supabaseDir, 'config.toml'),
    })
    expect(plan.errors).toEqual(['alpha: import_map file not found (./functions/alpha/deno.json)'])
  })
})

describe('parseArgs and the deploy command', () => {
  it('builds one API deploy for every slug', () => {
    expect(
      buildDeployArgs({ slugs: ['alpha', 'beta'], projectRef: STAGING_REF, jobs: DEFAULT_JOBS }),
    ).toEqual([
      'functions',
      'deploy',
      'alpha',
      'beta',
      '--project-ref',
      STAGING_REF,
      '--use-api',
      '--jobs',
      String(DEFAULT_JOBS),
    ])
  })

  it('reads flags', () => {
    expect(parseArgs(['--dry-run', '--project-ref', STAGING_REF, '--jobs=2'])).toEqual({
      dryRun: true,
      help: false,
      projectRef: STAGING_REF,
      jobs: '2',
    })
  })

  it('rejects an unknown flag', () => {
    expect(() => parseArgs(['--prune'])).toThrow('Unknown argument: --prune')
  })

  it('uses the CLI on PATH when it is the pinned version', () => {
    const calls = []
    const command = resolveSupabaseCommand((cmd, args) => {
      calls.push({ cmd, args })
      return { status: 0, stdout: `${SUPABASE_CLI_VERSION}\n` }
    }, {})
    expect(command).toEqual({ command: 'supabase', prefixArgs: [] })
    expect(calls).toEqual([{ cmd: 'supabase', args: ['--version'] }])
  })

  it('ignores a different CLI version on PATH', () => {
    const command = resolveSupabaseCommand(
      () => ({ status: 0, stdout: '1.62.0\n' }),
      {},
    )
    expect(command).toEqual({
      command: 'npx',
      prefixArgs: ['--yes', `supabase@${SUPABASE_CLI_VERSION}`],
    })
  })

  it('falls back to the pinned npx package when the CLI is absent', () => {
    const command = resolveSupabaseCommand(() => ({ status: null, error: new Error('missing') }), {})
    expect(command).toEqual({
      command: 'npx',
      prefixArgs: ['--yes', `supabase@${SUPABASE_CLI_VERSION}`],
    })
  })
})

describe('runDeploy', () => {
  it('dry-runs this repo without calling the CLI', () => {
    const lines = []
    const code = runDeploy({
      argv: ['--dry-run'],
      env: {},
      spawn: () => {
        throw new Error('dry run must not spawn')
      },
      stdout: (line) => lines.push(line),
      stderr: (line) => lines.push(line),
    })

    expect(code).toBe(0)
    expect(lines[0]).toBe(`Would deploy ${FUNCTIONS.length} edge functions:`)
    expect(lines).toContain('  stripe-webhook')
    expect(lines.at(-1)).toMatch(/Project ref not set/)
  })

  it('refuses a real deploy without a token', () => {
    const errors = []
    const code = runDeploy({
      argv: ['--project-ref', STAGING_REF],
      env: {},
      spawn: () => {
        throw new Error('must not spawn')
      },
      stdout: () => {},
      stderr: (line) => errors.push(line),
    })

    expect(code).toBe(1)
    expect(errors.at(-1)).toMatch(/SUPABASE_ACCESS_TOKEN/)
  })

  it('deploys the full set with the pinned CLI when supabase is not installed', () => {
    const calls = []
    const code = runDeploy({
      argv: ['--project-ref', STAGING_REF, '--jobs', '2'],
      env: { SUPABASE_ACCESS_TOKEN: 'sbp_test_token' },
      spawn: (command, args, options = {}) => {
        calls.push({ command, args, env: options.env })
        if (args[0] === '--version') return { status: 1, stdout: '' }
        return { status: 0 }
      },
      stdout: () => {},
      stderr: (line) => {
        throw new Error(line)
      },
    })

    expect(code).toBe(0)
    expect(calls[0]).toEqual({ command: 'supabase', args: ['--version'] })
    expect(calls[1].command).toBe('npx')
    expect(calls[1].args.slice(0, 2)).toEqual(['--yes', `supabase@${SUPABASE_CLI_VERSION}`])
    expect(calls[1].args).toEqual([
      '--yes',
      `supabase@${SUPABASE_CLI_VERSION}`,
      ...buildDeployArgs({ slugs: FUNCTIONS, projectRef: STAGING_REF, jobs: 2 }),
    ])
    expect(calls[1].args.join(' ')).not.toContain('sbp_test_token')
    expect(calls[1].env.SUPABASE_ACCESS_TOKEN).toBe('sbp_test_token')
  })

  it('rejects a project ref that is not 20 lowercase letters', () => {
    const errors = []
    const code = runDeploy({
      argv: ['--project-ref', 'production'],
      env: { SUPABASE_ACCESS_TOKEN: 'sbp_test_token' },
      spawn: () => {
        throw new Error('must not spawn')
      },
      stdout: () => {},
      stderr: (line) => errors.push(line),
    })

    expect(code).toBe(1)
    expect(errors).toEqual(['Invalid Supabase project ref: production'])
  })
})

function makeRoot(roots) {
  const root = mkdtempSync(path.join(tmpdir(), 'edge-deploy-'))
  roots.push(root)
  return root
}

function writeFunction(functionsDir, slug) {
  const dir = path.join(functionsDir, slug)
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, 'index.ts'), 'export {}\n')
  writeFileSync(path.join(dir, 'deno.json'), '{}\n')
}
