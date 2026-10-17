import { supabase } from './supabase'
import { withIssuedAtRetry } from './pageLoad'

/** `my_account` returns a table, so PostgREST hands back an array. */
export function firstAccountRow(data) {
  if (Array.isArray(data)) return data[0] ?? null
  return data ?? null
}

/**
 * Columns readable before 00023. That migration adds `my_account()` and
 * revokes direct SELECT of email, full name, and verification status.
 */
const DIRECT_ACCOUNT_COLUMNS =
  'email, full_name, phone, display_name, bio, avatar_url, is_host, verification_status, stripe_payouts_enabled'

const DIRECT_ACCOUNT_COLUMNS_WITHOUT_BIO =
  'email, full_name, phone, display_name, avatar_url, is_host, verification_status, stripe_payouts_enabled'

function selectOwnRow(userId, columns) {
  return supabase.from('users').select(columns).eq('id', userId).maybeSingle()
}

/**
 * The signed-in user's own account. Prefer `my_account` (00023). If that
 * function is not deployed yet, read the same fields from `users`.
 */
export async function loadOwnAccount(userId) {
  const rpc = await withIssuedAtRetry(() => supabase.rpc('my_account'))
  const rpcRow = firstAccountRow(rpc.data)
  if (!rpc.error && rpcRow) return { data: rpcRow, error: null }

  let direct = await selectOwnRow(userId, DIRECT_ACCOUNT_COLUMNS)
  if (direct.error && /bio/i.test(String(direct.error.message ?? ''))) {
    direct = await selectOwnRow(userId, DIRECT_ACCOUNT_COLUMNS_WITHOUT_BIO)
  }

  if (!direct.error && direct.data) return { data: direct.data, error: null }
  return { data: null, error: rpc.error || direct.error || null }
}
