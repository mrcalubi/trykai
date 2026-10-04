/**
 * Fallback when `display_name` is empty. Public surfaces use `publicName`.
 */
export function firstName(fullName) {
  if (typeof fullName !== 'string') return ''
  return fullName.trim().split(/\s+/).filter(Boolean)[0] ?? ''
}
