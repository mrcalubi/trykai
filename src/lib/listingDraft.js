/**
 * The create-listing wizard's steps and its draft, kept in this browser so a
 * host can leave and come back. Hosting reads the same draft to offer Continue.
 */

export const LISTING_STEPS = [
  {
    id: 'basics',
    label: 'Basics',
    title: 'The basics',
    intro: 'Say what guests will learn, in your own words.',
  },
  {
    id: 'photos',
    label: 'Photos',
    title: 'Add photos',
    intro: 'Real photos of your session, taken on your phone, are perfect.',
  },
  {
    id: 'price',
    label: 'Price',
    title: 'Price and group size',
    intro: 'Small, affordable sessions are what guests come to TryKai for.',
  },
  {
    id: 'location',
    label: 'Location',
    title: 'Where it happens',
    intro: 'Guests see only the area until they book.',
  },
  {
    id: 'finish',
    label: 'Publish',
    title: 'Final touches',
    intro: 'Say what you provide and what guests should bring, then publish.',
  },
]

export function draftKey(userId) {
  return `trykai:listing-draft:${userId}`
}

export function readDraft(userId) {
  if (!userId) return null
  try {
    const raw = window.localStorage.getItem(draftKey(userId))
    const draft = raw ? JSON.parse(raw) : null
    return draft && typeof draft === 'object' ? draft : null
  } catch {
    return null
  }
}

export function writeDraft(userId, values) {
  if (!userId) return false
  try {
    window.localStorage.setItem(draftKey(userId), JSON.stringify(values))
    return true
  } catch {
    return false
  }
}

export function clearDraft(userId) {
  try {
    window.localStorage.removeItem(draftKey(userId))
  } catch {
    // Storage can be blocked; then there is no draft to clear.
  }
}

/** A saved draft's answers with anything missing or malformed set to the wizard's defaults. */
export function draftValues(draft) {
  const text = (key) => (typeof draft?.[key] === 'string' ? draft[key] : '')
  const lastStep = LISTING_STEPS.length - 1
  return {
    step: Number.isInteger(draft?.step) ? Math.min(Math.max(draft.step, 0), lastStep) : 0,
    title: text('title'),
    description: text('description'),
    category: text('category'),
    price: text('price'),
    maxGuests: Number.isInteger(draft?.maxGuests) ? draft.maxGuests : 4,
    durationChoice:
      Number.isInteger(draft?.durationChoice) || draft?.durationChoice === 'other'
        ? draft.durationChoice
        : null,
    otherMins: text('otherMins'),
    groupPricing: typeof draft?.groupPricing === 'boolean' ? draft.groupPricing : true,
    area: text('area'),
    fullAddress: text('fullAddress'),
    whatsProvided: Array.isArray(draft?.whatsProvided) ? draft.whatsProvided : [],
    whatToBring: Array.isArray(draft?.whatToBring) ? draft.whatToBring : [],
  }
}

/** True when the wizard has only defaults — not enough to keep as a draft. */
export function isBlankDraft(draft) {
  const values = draftValues(draft)
  return (
    !values.title.trim() &&
    !values.description.trim() &&
    !values.category.trim() &&
    !values.price.trim() &&
    values.durationChoice == null &&
    !values.area.trim() &&
    !values.fullAddress.trim() &&
    values.whatsProvided.length === 0 &&
    values.whatToBring.length === 0
  )
}
