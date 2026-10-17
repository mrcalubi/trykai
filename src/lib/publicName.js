/**
 * Public surfaces show `display_name` only. `full_name` is no longer
 * SELECT-able on `users` (`00023`).
 */
export function publicName(user) {
  if (!user || typeof user !== 'object') return ''
  const display = typeof user.display_name === 'string' ? user.display_name.trim() : ''
  return display
}
