/**
 * Public surfaces show a given name only. Settings still edits `full_name`.
 * Review RPCs already return the first name in `users.full_name`; host
 * names on listing and profile pages still come from the column.
 */
export function firstName(fullName) {
  if (typeof fullName !== 'string') return ''
  return fullName.trim().split(/\s+/).filter(Boolean)[0] ?? ''
}
