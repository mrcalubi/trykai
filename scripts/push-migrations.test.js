import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MAX_PENDING,
  listLocalMigrations,
  parseArgs,
  parseMigrationList,
  planPush,
  runPush,
} from './push-migrations.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const STAGING_REF = 'hzgybclfvpuxkmytdoos'
const LOCAL = listLocalMigrations(path.join(repoRoot, 'supabase', 'migrations'))

function listOutput(appliedCount) {
  const rows = LOCAL.map(
    (version, index) =>
      `   ${version} | ${index < appliedCount ? version : '     '} | ${version}`,
  )
  return ['   Local | Remote | Time (UTC)', '  -------|--------|-----------', ...rows].join('\n')
}

function harness({ listStdout, listStatus = 0, pushStatus = 0, env = {}, argv = [] } = {}) {
  const calls = []
  const out = []
  const err = []
  const spawn = (command, args, options) => {
    calls.push({ command, args, stdio: options?.stdio })
    if (args.includes('--version')) return { status: 0, stdout: '2.121.0' }
    if (args.includes('list')) return { status: listStatus, stdout: listStdout, stderr: 'boom' }
    return { status: pushStatus }
  }
  const code = runPush({
    argv: ['--project-ref', STAGING_REF, ...argv],
    env: { SUPABASE_ACCESS_TOKEN: 'token', SUPABASE_DB_PASSWORD: 'pw', ...env },
    spawn,
    repoRoot,
    stdout: (line) => out.push(line),
    stderr: (line) => err.push(line),
  })
  const push = calls.find((call) => call.args.includes('push'))
  return { code, calls, push, out: out.join('\n'), err: err.join('\n') }
}

describe('this repo', () => {
  it('finds the migrations in order', () => {
    expect(LOCAL[0]).toBe('00001')
    expect(LOCAL.length).toBeGreaterThan(50)
    expect([...LOCAL].sort()).toEqual(LOCAL)
  })

  it('pushes migrations in CI before the edge functions deploy', () => {
    const workflow = readFileSync(path.join(repoRoot, '.github', 'workflows', 'ci.yml'), 'utf8')
    const push = workflow.indexOf('node scripts/push-migrations.mjs --skip-if-unconfigured')
    const deploy = workflow.lastIndexOf('run: node scripts/deploy-edge-functions.mjs')
    expect(push).toBeGreaterThan(-1)
    expect(deploy).toBeGreaterThan(push)
  })
})

describe('parseMigrationList', () => {
  it('reads local and remote versions and ignores the header', () => {
    const text = [
      '   Local | Remote | Time (UTC)',
      '  -------|--------|-----------',
      '   00001 | 00001  | 00001',
      '   00002 |        | 00002',
      '         | 00003  | 00003',
    ].join('\n')
    expect(parseMigrationList(text)).toEqual([
      { local: '00001', remote: '00001' },
      { local: '00002', remote: '' },
      { local: '', remote: '00003' },
    ])
  })

  it('reads box-drawing separators and strips colour codes', () => {
    expect(parseMigrationList('\u001b[1m 00001 \u001b[0m│ 00001 │ 00001')).toEqual([
      { local: '00001', remote: '00001' },
    ])
  })
})

describe('planPush', () => {
  const rows = [
    { local: '00001', remote: '00001' },
    { local: '00002', remote: '' },
  ]

  it('returns the versions the database has not run', () => {
    expect(planPush({ localVersions: ['00001', '00002'], rows, maxPending: 5 })).toEqual({
      pending: ['00002'],
      errors: [],
    })
  })

  it('fails closed when the list does not match the files on disk', () => {
    const plan = planPush({ localVersions: ['00001', '00002', '00003'], rows, maxPending: 5 })
    expect(plan.errors[0]).toMatch(/Could not read the migration list/)
    expect(planPush({ localVersions: [], rows: [], maxPending: 5 }).errors).toHaveLength(1)
  })

  it('refuses when the database is ahead of the branch', () => {
    const plan = planPush({
      localVersions: ['00001'],
      rows: [
        { local: '00001', remote: '00001' },
        { local: '', remote: '00002' },
      ],
      maxPending: 5,
    })
    expect(plan.errors[0]).toMatch(/does not: 00002/)
  })
})

describe('parseArgs', () => {
  it('defaults and reads flags', () => {
    expect(parseArgs([]).maxPending).toBe(DEFAULT_MAX_PENDING)
    expect(parseArgs(['--max-pending=9', '--dry-run', `--project-ref=${STAGING_REF}`])).toMatchObject(
      { maxPending: 9, dryRun: true, projectRef: STAGING_REF },
    )
  })

  it('rejects bad input', () => {
    expect(() => parseArgs(['--max-pending', '0'])).toThrow(/positive integer/)
    expect(() => parseArgs(['--project-ref'])).toThrow(/needs a value/)
    expect(() => parseArgs(['--force'])).toThrow(/Unknown argument/)
  })
})

describe('runPush', () => {
  it('applies only the new migrations and keeps the password off the command line', () => {
    const result = harness({ listStdout: listOutput(LOCAL.length - 2) })
    expect(result.code).toBe(0)
    expect(result.out).toContain(`Applying 2 migration(s) to ${STAGING_REF}`)
    expect(result.push.args).toEqual(['db', 'push', '--project-ref', STAGING_REF, '--yes'])
    expect(result.calls.flatMap((call) => call.args)).not.toContain('pw')
  })

  it('does not push when everything is applied', () => {
    const result = harness({ listStdout: listOutput(LOCAL.length) })
    expect(result.code).toBe(0)
    expect(result.push).toBeUndefined()
    expect(result.out).toContain('up to date')
  })

  it('refuses to replay the whole folder onto a database with no history', () => {
    const result = harness({ listStdout: listOutput(0) })
    expect(result.code).toBe(1)
    expect(result.push).toBeUndefined()
    expect(result.err).toMatch(/migration repair --status applied/)
  })

  it('passes --dry-run through', () => {
    const result = harness({ listStdout: listOutput(LOCAL.length - 1), argv: ['--dry-run'] })
    expect(result.code).toBe(0)
    expect(result.push.args).toContain('--dry-run')
  })

  it('skips with a warning when CI has no database password', () => {
    const result = harness({
      env: { SUPABASE_DB_PASSWORD: '' },
      argv: ['--skip-if-unconfigured'],
    })
    expect(result.code).toBe(0)
    expect(result.calls).toEqual([])
    expect(result.out).toContain('::warning title=Migrations not applied::')
  })

  it('fails without credentials, on a bad ref, and when the CLI fails', () => {
    expect(harness({ env: { SUPABASE_DB_PASSWORD: '' } }).code).toBe(1)
    expect(harness({ env: { SUPABASE_ACCESS_TOKEN: '' } }).code).toBe(1)
    expect(harness({ argv: ['--project-ref', 'nope'] }).code).toBe(1)
    expect(harness({ listStdout: '', listStatus: 1 }).code).toBe(1)
    expect(harness({ listStdout: listOutput(LOCAL.length - 1), pushStatus: 3 }).code).toBe(3)
  })
})
