import { describe, expect, it, vi } from 'vitest'
import { MAX_OPERATOR_LENGTH, authenticateAdmin, secretsMatch, type AdminAuthDeps } from './admin-auth.ts'

function request(headers: Record<string, string> = {}) {
  return new Request('https://example.test/functions/v1/admin-dispute-booking', {
    method: 'POST',
    headers,
  })
}

function deps(overrides: Partial<AdminAuthDeps> = {}): AdminAuthDeps {
  return {
    getUserId: vi.fn(async (authorization: string) =>
      authorization === 'Bearer admin-jwt' || authorization === 'Bearer guest-jwt'
        ? authorization.replace('Bearer ', '').replace('-jwt', '-id')
        : null,
    ),
    isAdmin: vi.fn(async (userId: string) => userId === 'admin-id'),
    breakGlassSecret: 'glass',
    ...overrides,
  }
}

describe('authenticateAdmin', () => {
  it('accepts an admin JWT and records the user id', async () => {
    const d = deps()
    await expect(authenticateAdmin(request({ Authorization: 'Bearer admin-jwt' }), d)).resolves.toEqual({
      ok: true,
      actor: { method: 'admin_jwt', userId: 'admin-id', operator: null },
    })
    expect(d.isAdmin).toHaveBeenCalledWith('admin-id')
  })

  it('refuses a signed-in user who is not an admin, even with the secret', async () => {
    await expect(
      authenticateAdmin(
        request({ Authorization: 'Bearer guest-jwt', 'x-admin-secret': 'glass', 'x-admin-operator': 'Caleb' }),
        deps(),
      ),
    ).resolves.toEqual({ ok: false, status: 403, error: 'Not authorised' })
  })

  it('prefers the JWT over break-glass so the actor is recorded', async () => {
    const result = await authenticateAdmin(
      request({ Authorization: 'Bearer admin-jwt', 'x-admin-secret': 'glass', 'x-admin-operator': 'Caleb' }),
      deps(),
    )
    expect(result).toMatchObject({ ok: true, actor: { method: 'admin_jwt' } })
  })

  it('falls back to break-glass with the anon key as bearer', async () => {
    await expect(
      authenticateAdmin(
        request({ Authorization: 'Bearer anon-key', 'x-admin-secret': 'glass', 'x-admin-operator': ' Caleb ' }),
        deps(),
      ),
    ).resolves.toEqual({ ok: true, actor: { method: 'break_glass', userId: null, operator: 'Caleb' } })
  })

  it('requires an operator name for break-glass', async () => {
    const missing = await authenticateAdmin(request({ 'x-admin-secret': 'glass' }), deps())
    expect(missing).toMatchObject({ ok: false, status: 400 })
    const tooLong = await authenticateAdmin(
      request({ 'x-admin-secret': 'glass', 'x-admin-operator': 'x'.repeat(MAX_OPERATOR_LENGTH + 1) }),
      deps(),
    )
    expect(tooLong).toMatchObject({ ok: false, status: 400 })
  })

  it('returns 401 for no credentials, a wrong secret, or break-glass turned off', async () => {
    const d = deps()
    await expect(authenticateAdmin(request(), d)).resolves.toMatchObject({ status: 401 })
    expect(d.getUserId).not.toHaveBeenCalled()
    await expect(
      authenticateAdmin(request({ 'x-admin-secret': 'nope', 'x-admin-operator': 'Caleb' }), d),
    ).resolves.toMatchObject({ status: 401 })
    await expect(
      authenticateAdmin(
        request({ 'x-admin-secret': 'glass', 'x-admin-operator': 'Caleb' }),
        deps({ breakGlassSecret: undefined }),
      ),
    ).resolves.toMatchObject({ status: 401 })
  })

  it('does not accept the secret as a bearer token', async () => {
    await expect(authenticateAdmin(request({ Authorization: 'Bearer glass' }), deps())).resolves.toMatchObject({
      status: 401,
    })
  })
})

describe('secretsMatch', () => {
  it('matches only the exact secret', () => {
    expect(secretsMatch('glass', 'glass')).toBe(true)
    expect(secretsMatch('glas', 'glass')).toBe(false)
    expect(secretsMatch('glasses', 'glass')).toBe(false)
    expect(secretsMatch(null, 'glass')).toBe(false)
    expect(secretsMatch('', '')).toBe(false)
    expect(secretsMatch('glass', undefined)).toBe(false)
  })
})
