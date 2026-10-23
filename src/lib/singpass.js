/**
 * Singpass Login for host verification (00035). Off unless the environment
 * turns it on, so production keeps the upload route until its Singpass app is
 * approved: set VITE_SINGPASS_ENABLED=true in Vercel for that environment.
 */
export function singpassEnabled(env = import.meta.env) {
  return env?.VITE_SINGPASS_ENABLED === 'true'
}

export const SINGPASS_RETURN_PATH = '/verify-identity/singpass'
