/**
 * What Edit listing writes to the listings row. A save sends only the columns
 * the host changed since the page loaded (or last saved), never the whole form.
 *
 * Sending the whole form let a tab that was opened before a fix write the old
 * text back. In November a host fixed a title typo, the team approved the
 * listing, then a save from an older tab (new photos only) put the typo back,
 * and approved listings are not reviewed again.
 */

import { parsePriceInputCents } from './pricing'
import { providedForSave } from './whatsProvided'
import { whatToBringForSave } from './whatToBring'
import { arrivalInstructionsForSave, bookingCutoffHours } from './bookingCutoff'

const text = (value) => String(value ?? '').trim()

/** Edit listing's form values as listings columns. */
export function listingColumns(values, photoUrls) {
  return {
    title: text(values.title),
    description: text(values.description),
    category: values.category,
    price_per_person: parsePriceInputCents(values.price),
    duration_mins: parseInt(values.durationMins, 10),
    group_pricing: values.groupPricing,
    area: values.area,
    full_address: text(values.fullAddress),
    arrival_instructions: arrivalInstructionsForSave(values.arrivalInstructions),
    booking_cutoff_hours: bookingCutoffHours(values.bookingCutoffHours),
    whats_provided: providedForSave(values.whatsProvided),
    what_to_bring: whatToBringForSave(values.whatToBring),
    photo_urls: photoUrls,
  }
}

/** The photo URLs a set of saved editor photos stands for. */
export function savedPhotoUrls(photos) {
  return (photos ?? []).map((photo) => photo.remoteUrl).filter(Boolean)
}

/** Only the columns in `next` that differ from `previous`. No `previous` means all of them. */
export function changedListingColumns(next, previous) {
  if (!previous) return { ...next }
  const changed = {}
  for (const [key, value] of Object.entries(next)) {
    if (JSON.stringify(value) !== JSON.stringify(previous[key])) changed[key] = value
  }
  return changed
}
