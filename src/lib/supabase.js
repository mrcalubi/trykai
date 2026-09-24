import { createClient } from '@supabase/supabase-js'

/**
 * auth-js initialize() reads the implicit-grant hash, then clears
 * `window.location.hash` and notifies `PASSWORD_RECOVERY` on a `setTimeout(0)`.
 * Capture the callback params before `createClient` so a recovery or error
 * cannot be missed if the page mounts after that work finishes.
 */
function readAuthCallbackFromLocation() {
  if (typeof window === 'undefined') {
    return { type: null, error: null, error_code: null, error_description: null }
  }

  const url = new URL(window.location.href)
  const params = {}

  if (url.hash && url.hash.startsWith('#')) {
    new URLSearchParams(url.hash.slice(1)).forEach((value, key) => {
      params[key] = value
    })
  }

  url.searchParams.forEach((value, key) => {
    params[key] = value
  })

  return {
    type: params.type ?? null,
    error: params.error ?? null,
    error_code: params.error_code ?? null,
    error_description: params.error_description ?? null,
  }
}

export const authCallbackFromUrl = readAuthCallbackFromLocation()

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

let passwordRecoverySeen = authCallbackFromUrl.type === 'recovery'

if (typeof supabase.auth?.onAuthStateChange === 'function') {
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') {
      passwordRecoverySeen = true
    }
  })
}

export function passwordRecoveryWasSeen() {
  return passwordRecoverySeen
}
