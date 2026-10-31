const LOCAL_RE = /^[3689]\d{7}$/

export function parseDayOfPhone(value) {
  const digits = String(value ?? '').replace(/\D/g, '')
  let local = digits
  if (digits.startsWith('65') && digits.length === 10) local = digits.slice(2)
  if (!LOCAL_RE.test(local)) return null
  return `+65${local}`
}

export function dayOfPhoneLocal(value) {
  const stored = parseDayOfPhone(value)
  return stored ? stored.slice(3) : ''
}

export function telHref(value) {
  const stored = parseDayOfPhone(value)
  return stored ? `tel:${stored}` : ''
}

export function whatsappHref(value) {
  const stored = parseDayOfPhone(value)
  return stored ? `https://wa.me/${stored.slice(1)}` : ''
}

export function isDayOfContactWindow(startsAt, durationMins, now = Date.now()) {
  const start = new Date(startsAt ?? '').getTime()
  if (Number.isNaN(start)) return false
  const minutes = Number(durationMins) > 0 ? Number(durationMins) : 120
  return now >= start - 24 * 60 * 60 * 1000 && now <= start + minutes * 60 * 1000
}

export function dayOfPhoneError(value, { required = false } = {}) {
  const raw = String(value ?? '').trim()
  if (!raw) return required ? 'Enter an 8-digit Singapore number.' : ''
  if (!parseDayOfPhone(raw)) {
    return 'Use an 8-digit Singapore number starting with 3, 6, 8 or 9.'
  }
  return ''
}
