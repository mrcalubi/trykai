/** Friendly copy for a first-load failure. Never show the raw error to users. */
export const PAGE_LOAD_ERROR = 'Something went wrong loading this page. Please refresh.'

export function isIssuedAtFutureError(error) {
  return /issued at future/i.test(String(error?.message ?? ''))
}

export function pageLoadErrorMessage(error) {
  return error ? PAGE_LOAD_ERROR : ''
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

/**
 * First data loads can fail when the JWT `iat` is a second ahead of the
 * database clock. Retry once after 1 second; the caller still shows
 * PAGE_LOAD_ERROR if it fails again.
 */
export async function withIssuedAtRetry(load, delayMs = 1000) {
  const first = await load()
  if (!isIssuedAtFutureError(first?.error)) return first
  await wait(delayMs)
  return load()
}
