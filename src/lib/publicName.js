import { firstName } from './firstName'

/**
 * Public surfaces show `display_name`. `firstName(full_name)` is only the
 * fallback while a row has no display name yet.
 */
export function publicName(user) {
  if (!user || typeof user !== 'object') return ''
  const display = typeof user.display_name === 'string' ? user.display_name.trim() : ''
  if (display) return display
  return firstName(user.full_name)
}
