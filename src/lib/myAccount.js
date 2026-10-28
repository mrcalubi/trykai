/** `my_account` returns a table, so PostgREST hands back an array. */
export function firstAccountRow(data) {
  if (Array.isArray(data)) return data[0] ?? null
  return data ?? null
}

/** SiteNav listens and re-reads `my_account()` so the bar stays in sync. */
export const ACCOUNT_UPDATED_EVENT = 'trykai:account-updated'

export function notifyAccountUpdated() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(ACCOUNT_UPDATED_EVENT))
}
