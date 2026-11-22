import { describe as group, expect, it } from 'vitest'
import { describe, diffConfigs, isSecretSetting, parseArgs, runCopyAuth } from './copy-auth-config.mjs'

const OLD = 'dqqlwofluvhikebtjune'
const NEW = 'bovqdzfewsrgvjkegpzz'

function fakeApi({ configs, refuse = () => null }) {
  const calls = []
  const fetchImpl = async (url, { method, headers, body }) => {
    const ref = url.match(/projects\/([a-z]+)\//)[1]
    calls.push({ method, ref, auth: headers.Authorization, body: body ? JSON.parse(body) : undefined })
    if (method === 'GET') {
      if (!configs[ref]) return new Response(JSON.stringify({ message: 'not found' }), { status: 404 })
      return new Response(JSON.stringify(configs[ref]), { status: 200 })
    }
    const patch = JSON.parse(body)
    const reason = refuse(patch)
    if (reason) return new Response(JSON.stringify({ message: reason }), { status: 400 })
    Object.assign(configs[ref], patch)
    return new Response(JSON.stringify(configs[ref]), { status: 200 })
  }
  return { fetchImpl, calls }
}

async function run({ argv, env = { SUPABASE_ACCESS_TOKEN: 'tok' }, api }) {
  const out = []
  const err = []
  const code = await runCopyAuth({
    argv,
    env,
    fetchImpl: api.fetchImpl,
    log: (line) => out.push(line),
    logError: (line) => err.push(line),
  })
  return { code, out: out.join('\n'), err: err.join('\n') }
}

group('parseArgs', () => {
  it('reads refs and --apply', () => {
    expect(parseArgs(['--from', OLD, '--to', NEW, '--apply'])).toEqual({ from: OLD, to: NEW, apply: true, help: false })
  })

  it('rejects bad refs', () => {
    expect(() => parseArgs(['--from', OLD])).toThrow('--to')
    expect(() => parseArgs(['--from', 'abc', '--to', NEW])).toThrow('--from')
    expect(() => parseArgs(['--from', OLD, '--to', OLD])).toThrow('same project')
    expect(() => parseArgs(['--from'])).toThrow('needs a project ref')
    expect(() => parseArgs(['--yes'])).toThrow('Unknown option')
  })
})

group('isSecretSetting', () => {
  it('catches secrets but not settings about tokens', () => {
    for (const key of ['smtp_pass', 'external_apple_secret', 'sms_twilio_auth_token', 'sms_textlocal_api_key',
      'sms_messagebird_access_key', 'security_captcha_secret', 'hook_send_email_secrets']) {
      expect(isSecretSetting(key)).toBe(true)
    }
    for (const key of ['refresh_token_rotation_enabled', 'security_refresh_token_reuse_interval',
      'hook_custom_access_token_uri', 'smtp_user', 'mailer_otp_length', 'rate_limit_token_refresh',
      'external_apple_client_id']) {
      expect(isSecretSetting(key)).toBe(false)
    }
  })

  it('never treats a switch or a number as a secret', () => {
    expect(isSecretSetting('security_update_password_require_current_password', true)).toBe(false)
    expect(isSecretSetting('security_update_password_require_current_password', false)).toBe(false)
    expect(isSecretSetting('smtp_pass', 'x')).toBe(true)
    expect(isSecretSetting('smtp_pass', null)).toBe(true)
  })
})

group('diffConfigs', () => {
  it('copies differences, skips equal values and secrets, swaps the ref', () => {
    const from = {
      site_url: 'https://trykai.sg',
      mailer_otp_length: 6,
      uri_allow_list: 'https://trykai.sg/**',
      smtp_pass: 'hunter2',
      external_apple_secret: null,
      security_update_password_require_current_password: true,
      hook_custom_access_token_uri: `pg-functions://postgres/public/hook`,
      hook_send_email_uri: `https://${OLD}.supabase.co/functions/v1/send-email`,
      only_on_new: undefined,
    }
    const to = { site_url: 'http://localhost:3000', mailer_otp_length: 6, uri_allow_list: '', smtp_pass: null,
      hook_custom_access_token_uri: null, extra_new_setting: true }
    const { copy, secrets, refSwapped } = diffConfigs(from, to, OLD, NEW)
    expect(copy).toEqual({
      site_url: 'https://trykai.sg',
      uri_allow_list: 'https://trykai.sg/**',
      hook_custom_access_token_uri: 'pg-functions://postgres/public/hook',
      hook_send_email_uri: `https://${NEW}.supabase.co/functions/v1/send-email`,
      security_update_password_require_current_password: true,
    })
    expect(secrets).toEqual(['smtp_pass'])
    expect(refSwapped).toEqual(['hook_send_email_uri'])
  })
})

group('describe', () => {
  it('keeps long values short', () => {
    expect(describe(null)).toBe('empty')
    expect(describe(6)).toBe('6')
    expect(describe('a\n  b')).toBe('"a b"')
    expect(describe('x'.repeat(100))).toMatch(/…" \(100 chars\)$/)
  })
})

group('runCopyAuth', () => {
  const configs = () => ({
    [OLD]: { site_url: 'https://trykai.sg', mailer_otp_length: 6, rate_limit_email_sent: 100, smtp_pass: 'hunter2' },
    [NEW]: { site_url: 'http://localhost:3000', mailer_otp_length: 6, rate_limit_email_sent: 2, smtp_pass: null },
  })

  it('lists differences without writing, and never prints a secret value', async () => {
    const api = fakeApi({ configs: configs() })
    const { code, out } = await run({ argv: ['--from', OLD, '--to', NEW], api })
    expect(code).toBe(0)
    expect(out).toContain('site_url: "http://localhost:3000" → "https://trykai.sg"')
    expect(out).toContain('rate_limit_email_sent: 2 → 100')
    expect(out).toContain('smtp_pass')
    expect(out).not.toContain('hunter2')
    expect(out).toContain('2 settings differ')
    expect(api.calls.filter((c) => c.method !== 'GET')).toEqual([])
    expect(api.calls[0].auth).toBe('Bearer tok')
  })

  it('applies in one request and never writes to the old project', async () => {
    const data = configs()
    const api = fakeApi({ configs: data })
    const { code, out } = await run({ argv: ['--from', OLD, '--to', NEW, '--apply'], api })
    expect(code).toBe(0)
    expect(out).toContain('Copied 2 settings.')
    const writes = api.calls.filter((c) => c.method === 'PATCH')
    expect(writes).toEqual([
      { method: 'PATCH', ref: NEW, auth: 'Bearer tok', body: { site_url: 'https://trykai.sg', rate_limit_email_sent: 100 } },
    ])
    expect(data[NEW].smtp_pass).toBeNull()
  })

  it('falls back to one setting at a time and reports the refused ones', async () => {
    const data = configs()
    const api = fakeApi({
      configs: data,
      refuse: (patch) => ('rate_limit_email_sent' in patch ? 'Custom SMTP required' : null),
    })
    const { code, out, err } = await run({ argv: ['--from', OLD, '--to', NEW, '--apply'], api })
    expect(code).toBe(1)
    expect(out).toContain('Copied 1 of 2 settings.')
    expect(err).toContain('rate_limit_email_sent: PATCH')
    expect(err).toContain('Custom SMTP required')
    expect(data[NEW].site_url).toBe('https://trykai.sg')
  })

  it('needs a token, and reports a failed read', async () => {
    const api = fakeApi({ configs: configs() })
    expect((await run({ argv: ['--from', OLD, '--to', NEW], env: {}, api })).err).toContain('SUPABASE_ACCESS_TOKEN')
    const missing = fakeApi({ configs: { [OLD]: {} } })
    const { code, err } = await run({ argv: ['--from', OLD, '--to', NEW], api: missing })
    expect(code).toBe(1)
    expect(err).toContain('HTTP 404 not found')
  })

  it('says so when nothing differs', async () => {
    const same = { [OLD]: { site_url: 'x' }, [NEW]: { site_url: 'x' } }
    const { code, out } = await run({ argv: ['--from', OLD, '--to', NEW, '--apply'], api: fakeApi({ configs: same }) })
    expect(code).toBe(0)
    expect(out).toContain('No differences outside secrets.')
  })
})
