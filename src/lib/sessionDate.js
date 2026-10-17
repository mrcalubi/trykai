const TIME_ZONE = 'Asia/Singapore'

function singaporeYear(value) {
  return new Intl.DateTimeFormat('en-SG', {
    year: 'numeric',
    timeZone: TIME_ZONE,
  }).format(new Date(value))
}

function sessionDayOptions(value, now) {
  return {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(singaporeYear(value) === singaporeYear(now) ? {} : { year: 'numeric' }),
    timeZone: TIME_ZONE,
  }
}

/** "Sat, 20 Mar" this year, "Sat, 20 Mar 2027" otherwise. Singapore time. */
export function formatSessionDay(iso, now = Date.now()) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-SG', sessionDayOptions(date, now)).format(date)
}

export function formatSessionTime(iso) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-SG', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: TIME_ZONE,
  }).format(date)
}

/** "Sat, 20 Mar at 2:00 pm", with the year only when it is not this year. */
export function formatSessionDateTime(iso, now = Date.now()) {
  const day = formatSessionDay(iso, now)
  const time = formatSessionTime(iso)
  if (!day || !time) return ''
  return `${day} at ${time}`
}
