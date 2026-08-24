/** Staging Supabase project — used to gate test-only UI that must never ship against prod. */
const STAGING_PROJECT_REF = 'hzgybclfvpuxkmytdoos'

/**
 * True when the app is pointed at the staging database (or Vite `--mode staging`).
 * Prefer the URL check so a misconfigured mode cannot expose staging tools on production.
 */
export function isStagingMode() {
  const url = import.meta.env.VITE_SUPABASE_URL ?? ''
  return url.includes(STAGING_PROJECT_REF) || import.meta.env.MODE === 'staging'
}
