/**
 * First-touch marketing source for a booking (00061). The browser remembers
 * the utm_source / utm_medium / utm_campaign of the visitor's first tagged
 * visit and sends it with create-payment-intent; this is the server's copy of
 * the cleaning rule, so only short plain tags ever reach the bookings row.
 *
 * Shared with the browser (src/lib/attribution.js) so both sides agree.
 */

export const ATTRIBUTION_MAX_LENGTH = 100

export type BookingAttribution = {
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
}

/**
 * Lower-case, trimmed, at most 100 characters, and only letters, digits and
 * `_ - . + ~` (a space becomes `_`). Anything else, or an empty result, is
 * dropped so a crafted link cannot write free text into the bookings table.
 */
export function cleanTag(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const cleaned = value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_.+~-]/g, '')
    .slice(0, ATTRIBUTION_MAX_LENGTH)
  return cleaned || null
}

/**
 * Columns to add to the bookings insert. Empty when there is no usable
 * source: medium and campaign without a source are not worth keeping.
 */
export function bookingAttribution(input: unknown): BookingAttribution {
  if (!input || typeof input !== 'object') return {}
  const record = input as Record<string, unknown>
  const source = cleanTag(record.source)
  if (!source) return {}
  const medium = cleanTag(record.medium)
  const campaign = cleanTag(record.campaign)
  return {
    utm_source: source,
    ...(medium ? { utm_medium: medium } : {}),
    ...(campaign ? { utm_campaign: campaign } : {}),
  }
}

/** True when an insert failed only because 00061 is not applied yet. */
export function isMissingAttributionColumn(message: unknown): boolean {
  return typeof message === 'string' && /utm_(source|medium|campaign)/.test(message)
}
