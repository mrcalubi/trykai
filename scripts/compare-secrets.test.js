import { describe, expect, it } from 'vitest'
import { compareSecrets, parseArgs, runCompare } from './compare-secrets.mjs'

const OLD = 'dqqlwofluvhikebtjune'
const NEW = 'bovqdzfewsrgvjkegpzz'

function api(lists) {
  return async (url) => {
    const ref = url.match(/projects\/([a-z]+)\//)[1]
    if (!lists[ref]) return new Response('nope', { status: 403 })
    return new Response(JSON.stringify(lists[ref]), { status: 200 })
  }
}

async function run(lists, { env = { SUPABASE_ACCESS_TOKEN: 't' }, argv = ['--from', OLD, '--to', NEW] } = {}) {
  const out = []
  const err = []
  const code = await runCompare({ argv, env, fetchImpl: api(lists), log: (l) => out.push(l), logError: (l) => err.push(l) })
  return { code, out: out.join('\n'), err: err.join('\n') }
}

describe('parseArgs', () => {
  it('needs two different refs', () => {
    expect(parseArgs(['--from', OLD, '--to', NEW])).toEqual({ from: OLD, to: NEW })
    expect(() => parseArgs(['--from', OLD])).toThrow('--to')
    expect(() => parseArgs(['--from', OLD, '--to', OLD])).toThrow('same project')
    expect(() => parseArgs(['--x'])).toThrow('Unknown option')
  })
})

describe('compareSecrets', () => {
  it('classifies each name and ignores the built-in SUPABASE_ ones', () => {
    const rows = compareSecrets(
      [
        { name: 'A', value: '1' },
        { name: 'B', value: '2' },
        { name: 'C', value: '3' },
        { name: 'SUPABASE_URL', value: 'x' },
      ],
      [
        { name: 'A', value: '1' },
        { name: 'B', value: '9' },
        { name: 'D', value: '4' },
        { name: 'SUPABASE_URL', value: 'y' },
      ],
    )
    expect(rows).toEqual([
      { name: 'A', status: 'same' },
      { name: 'B', status: 'different' },
      { name: 'C', status: 'missing' },
      { name: 'D', status: 'extra' },
    ])
  })
})

describe('runCompare', () => {
  it('passes when everything matches and never prints a digest', async () => {
    const list = [{ name: 'STRIPE_SECRET_KEY', value: 'digest-abc123' }]
    const { code, out } = await run({ [OLD]: list, [NEW]: list })
    expect(code).toBe(0)
    expect(out).toContain('STRIPE_SECRET_KEY  same value')
    expect(out).toContain('All secrets match.')
    expect(out).not.toContain('digest-abc123')
  })

  it('fails on missing or different values; extra ones are only reported', async () => {
    const { code, out } = await run({
      [OLD]: [{ name: 'A', value: '1' }, { name: 'B', value: '2' }],
      [NEW]: [{ name: 'A', value: '0' }, { name: 'Z', value: '5' }],
    })
    expect(code).toBe(1)
    expect(out).toContain('A  DIFFERENT value')
    expect(out).toContain('B  MISSING on new')
    expect(out).toContain('Z  only on new')
    expect(out).toContain('2 to fix.')
  })

  it('reports a missing token or a failed read', async () => {
    expect((await run({}, { env: {} })).err).toContain('SUPABASE_ACCESS_TOKEN')
    const { code, err } = await run({ [OLD]: [] })
    expect(code).toBe(1)
    expect(err).toContain('HTTP 403')
  })
})
