// Caller authentication for admin-dispute-booking and admin-cancel-booking.
//
// Normal path: the caller's own Supabase JWT, re-checked against
// users.is_admin with the service role, the same way admin-verifications
// does. The admin's user id goes on every booking_money_events row.
//
// Break-glass: `x-admin-secret` (ADMIN_FUNCTION_SECRET) plus a required
// `x-admin-operator` name, for when no admin can sign in. Those rows have no
// actor_user_id, so they are marked 'break_glass' and carry the operator name
// in the note. Unset ADMIN_FUNCTION_SECRET to turn break-glass off.
//
// Pure apart from the injected lookups so vitest covers it without Supabase.

export type AdminActor =
  | { method: 'admin_jwt'; userId: string; operator: null }
  | { method: 'break_glass'; userId: null; operator: string }

export type AdminAuthResult =
  | { ok: true; actor: AdminActor }
  | { ok: false; status: 400 | 401 | 403; error: string }

export interface AdminAuthDeps {
  /** Resolves a bearer JWT to its user id, or null for anon / invalid tokens. */
  getUserId: (authorization: string) => Promise<string | null>
  isAdmin: (userId: string) => Promise<boolean>
  breakGlassSecret: string | undefined
}

export const MAX_OPERATOR_LENGTH = 100

/** Length-independent comparison so the secret check does not leak timing. */
export function secretsMatch(given: string | null, expected: string | undefined): boolean {
  if (!given || !expected) return false
  const a = new TextEncoder().encode(given)
  const b = new TextEncoder().encode(expected)
  let diff = a.length ^ b.length
  for (let i = 0; i < b.length; i++) diff |= (a[i] ?? 0) ^ b[i]
  return diff === 0
}

export async function authenticateAdmin(req: Request, deps: AdminAuthDeps): Promise<AdminAuthResult> {
  const authorization = req.headers.get('Authorization') ?? ''
  if (/^Bearer\s+\S+/i.test(authorization)) {
    const userId = await deps.getUserId(authorization)
    if (userId) {
      if (!(await deps.isAdmin(userId))) {
        return { ok: false, status: 403, error: 'Not authorised' }
      }
      return { ok: true, actor: { method: 'admin_jwt', userId, operator: null } }
    }
  }

  if (secretsMatch(req.headers.get('x-admin-secret'), deps.breakGlassSecret)) {
    const operator = (req.headers.get('x-admin-operator') ?? '').trim()
    if (!operator || operator.length > MAX_OPERATOR_LENGTH) {
      return {
        ok: false,
        status: 400,
        error: `Break-glass (x-admin-secret) needs an x-admin-operator header naming who is acting, ${MAX_OPERATOR_LENGTH} characters or fewer`,
      }
    }
    return { ok: true, actor: { method: 'break_glass', userId: null, operator } }
  }

  return { ok: false, status: 401, error: 'Unauthorized' }
}
