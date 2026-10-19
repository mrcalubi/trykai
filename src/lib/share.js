/**
 * Share a link with the native share sheet, falling back to the clipboard.
 *
 * `navigator.share` is missing on most desktop browsers and can throw even
 * where it exists (desktop Chrome device mode, insecure contexts, a
 * NotAllowedError when the call is not tied to a tap). Every failure except the
 * user closing the sheet falls back to copying the link.
 *
 * Resolves to one of:
 *   'shared'    the share sheet completed
 *   'cancelled' the user dismissed the sheet; show nothing
 *   'copied'    the link is on the clipboard
 *   'failed'    neither worked
 */
export async function shareOrCopy({ url, title }, nav = globalThis.navigator) {
  if (typeof nav?.share === 'function') {
    try {
      await nav.share({ title, url })
      return 'shared'
    } catch (error) {
      if (error?.name === 'AbortError') return 'cancelled'
    }
  }
  return copyText(url, nav)
}

async function copyText(text, nav) {
  try {
    if (typeof nav?.clipboard?.writeText === 'function') {
      await nav.clipboard.writeText(text)
      return 'copied'
    }
  } catch {
    // Clipboard can refuse (no permission, not focused); try the old way.
  }
  return legacyCopy(text) ? 'copied' : 'failed'
}

function legacyCopy(text) {
  if (typeof document === 'undefined' || typeof document.execCommand !== 'function') return false
  const field = document.createElement('textarea')
  field.value = text
  field.setAttribute('readonly', '')
  field.style.position = 'fixed'
  field.style.opacity = '0'
  document.body.appendChild(field)
  field.select()
  try {
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    field.remove()
  }
}

export const SHARE_NOTES = {
  copied: 'Link copied',
  failed: 'Could not copy the link. Copy it from the address bar.',
}
