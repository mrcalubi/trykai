export const REPORT_EMAIL = 'hello@trykai.sg'

export function reportMailto({ subject, url, id }) {
  const body = [url, id, '', "Tell us what's wrong:"].join('\n')
  return `mailto:${REPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

export function listingReportSubject(title) {
  return `Report: listing ${title}`
}

export function profileReportSubject(displayName) {
  return `Report: profile ${displayName}`
}

export function reviewReportSubject(listingTitle) {
  return `Report: review on ${listingTitle}`
}
