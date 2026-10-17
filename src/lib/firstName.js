/**
 * Split a legal name. Public surfaces use `publicName` (`display_name` only).
 */
export function firstName(fullName) {
  if (typeof fullName !== 'string') return ''
  return fullName.trim().split(/\s+/).filter(Boolean)[0] ?? ''
}
