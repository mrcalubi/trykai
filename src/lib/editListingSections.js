/**
 * Edit listing as an overview plus one short screen per section. These are
 * the sections, the one-line summary each shows on the overview, and the
 * "quick wins" (coral dots) that would make a listing easier to book.
 */

import { bookingCutoffLabel } from './bookingCutoff'
import { formatSgd } from './hostingDashboard'
import { formatDuration } from './duration'
import { providedItems } from './bookingPage'
import { guestFacingPriceCents, parsePriceInputCents } from './pricing'
import { formatSessionDay } from './sessionDate'

/** Five shots make a listing feel complete; the editor still allows up to eight. */
export const RECOMMENDED_PHOTOS = 5

export const EDIT_SECTION_GROUPS = [
  {
    label: 'The session',
    sections: [
      { id: 'basics', label: 'The basics' },
      { id: 'price', label: 'Price and time' },
      { id: 'addons', label: 'Add-ons' },
      { id: 'types', label: 'Classes' },
    ],
  },
  {
    label: 'Booking',
    sections: [
      { id: 'notice', label: 'Booking notice' },
      { id: 'location', label: 'Location' },
    ],
  },
  {
    label: 'What guests see',
    sections: [
      { id: 'photos', label: 'Photos' },
      { id: 'provided', label: "What's provided" },
      { id: 'bring', label: 'What to bring' },
    ],
  },
]

export const EDIT_SECTIONS = EDIT_SECTION_GROUPS.flatMap((group) => group.sections)

export function editSection(id) {
  return EDIT_SECTIONS.find((section) => section.id === id) ?? null
}

/** Which section a validation hint belongs to, so a failed save can open it. */
export function sectionForHint(key) {
  if (['title', 'description', 'category'].includes(key)) return 'basics'
  if (['price', 'spots', 'duration'].includes(key)) return 'price'
  if (['area', 'fullAddress'].includes(key) || key.startsWith('location-')) return 'location'
  if (key.startsWith('addon-')) return 'addons'
  if (key.startsWith('type-')) return 'types'
  return 'basics'
}

function plural(count, one, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`
}

function namesLine(count, noun, names) {
  if (!count) return { text: 'None yet' }
  const shown = names.filter(Boolean).join(', ')
  const label = plural(count, noun, noun.endsWith('s') ? `${noun}es` : `${noun}s`)
  return { text: shown ? `${label} · ${shown}` : label }
}

/**
 * The overview's one line per section, and whether it is a quick win.
 * `values` are the editor's current (possibly unsaved) values.
 */
export function sectionSummaries(values) {
  const priceCents = parsePriceInputCents(values.price)
  const spots = parseInt(values.maxGuests, 10)
  const duration = formatDuration(values.durationMins)
  const priceBits = [
    priceCents ? `Guests pay ${formatSgd(guestFacingPriceCents(priceCents))}` : 'No price yet',
    Number.isInteger(spots) && spots > 0 ? plural(spots, 'spot') : '',
    duration,
  ].filter(Boolean)

  const area = String(values.area ?? '').trim()
  // Several locations (00059): "Tampines + 2 more"; every one should say how to find it.
  const extras = values.multiLocation ? (values.extraLocations ?? []) : []
  const where = area && extras.length ? `${area} + ${extras.length} more` : area
  const hasDirections = [values.arrivalInstructions, ...extras.map((location) => location.arrivalInstructions)]
    .every((text) => Boolean(String(text ?? '').trim()))
  const photoCount = values.photos?.length ?? 0
  const missingPhotos = Math.max(RECOMMENDED_PHOTOS - photoCount, 0)
  const provided = providedItems(values.whatsProvided ?? [])
  const bring = values.whatToBring ?? []

  return {
    basics: {
      text: [values.category, String(values.title ?? '').trim()].filter(Boolean).join(' · ') || 'Add a title',
    },
    price: { text: priceBits.join(' · ') },
    addons: namesLine(
      values.addons?.length ?? 0,
      'add-on',
      (values.addons ?? []).map((addon) => addon.name?.trim()),
    ),
    types: namesLine(
      values.sessionTypes?.length ?? 0,
      'class',
      (values.sessionTypes ?? []).map((type) => type.name?.trim()),
    ),
    notice: { text: `Guests can book until ${bookingCutoffLabel(values.bookingCutoffHours)} before` },
    location: hasDirections
      ? { text: where || 'Add the address' }
      : { text: `${where ? `${where} · ` : ''}add directions for guests`, needsWork: true },
    photos: missingPhotos
      ? {
          text: `${plural(photoCount, 'photo')} · add ${missingPhotos} more`,
          needsWork: true,
        }
      : { text: plural(photoCount, 'photo') },
    provided: {
      text: values.whatsProvided?.includes('None')
        ? 'Nothing provided'
        : provided.length
          ? provided.join(', ')
          : 'Nothing listed yet',
    },
    bring: { text: bring.length ? bring.join(', ') : 'Nothing to bring' },
  }
}

export function quickWinCount(summaries) {
  return Object.values(summaries).filter((summary) => summary.needsWork).length
}

/** "Live", "In review" or "Changes requested", from the listing's review status. */
export function listingStatusLabel(reviewStatus) {
  if (reviewStatus === 'approved') return { label: 'Live', tone: 'live' }
  if (reviewStatus === 'pending') return { label: 'In review', tone: 'pending' }
  if (reviewStatus === 'changes_requested') return { label: 'Changes requested', tone: 'changes' }
  return null
}

/** "Next: Sat, 21 Nov · 2 of 4 booked", or nothing when no date is coming up. */
export function nextDateLine(sessions, maxGuests, now = Date.now()) {
  const next = (sessions ?? [])
    .filter((session) => new Date(session.starts_at).getTime() > now)
    .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))[0]
  if (!next) return ''
  const booked = (next.bookings ?? [])
    .filter((booking) => booking.status === 'confirmed')
    .reduce((sum, booking) => sum + (Number(booking.guests_count) || 0), 0)
  const spots = parseInt(maxGuests, 10)
  const fill = Number.isInteger(spots) && spots > 0 ? ` · ${booked} of ${spots} booked` : ''
  return `Next: ${formatSessionDay(next.starts_at, now)}${fill}`
}

/** Whole-dollar steps for the price, from wherever a cents price sits. */
export function stepPriceDollars(price, direction, { min = 1, max = 500 } = {}) {
  const current = Number.parseFloat(String(price))
  if (!Number.isFinite(current)) return String(min)
  const next = direction > 0 ? Math.floor(current) + 1 : Math.ceil(current) - 1
  return String(Math.min(Math.max(next, min), max))
}
