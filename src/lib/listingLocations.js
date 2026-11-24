/**
 * Listing locations (00059). A host with a team can run one listing at up to 4
 * places at once; each place has its own sessions and spots. Location 1 is the
 * listing's own place: its area, address and directions stay on the listing
 * (the database mirrors them into listing_locations), so the existing fields
 * edit it. Locations 2 to 4 live only in listing_locations.
 */

export const MAX_LOCATIONS = 4
export const LOCATION_LABEL_MAX = 40

export const MULTI_LOCATION_DISCLAIMER =
  "Only turn this on if you can run this session at every location at the same time, for example with a team member at each one. Each location takes its own bookings, so a booking at one place never closes the same time at another. If a booked session can't go ahead, it counts as a host cancellation."
export const MULTI_LOCATION_CONFIRM = 'I can run this session at all these locations at once.'
export const MULTI_LOCATION_GUEST_NOTE = 'Guests are told your teacher may be a team member.'

export const LOCATION_HINTS = {
  area: 'Pick the area guests see for this location.',
  fullAddress: 'Add the address for this location.',
}

export const LOCATIONS_NOT_SAVED_MESSAGE =
  "Your listing saved, but your other locations didn't. Try Save again."
export const LOCATIONS_NOT_SAVED_ON_CREATE =
  "Your listing is saved, but your other locations didn't save. Add them in Edit listing, under Location."

// The database's own refusals are already written for hosts.
const LOCATION_RULE_MESSAGES = [
  'Turn on multiple locations first.',
  'A listing can have at most 4 locations.',
  "Remove this location's upcoming dates first.",
  'A listing needs at least one location.',
  'Remove the other locations first.',
]

export function locationSaveMessage(error) {
  const message = String(error?.message ?? '')
  return LOCATION_RULE_MESSAGES.find((rule) => message.includes(rule)) ?? LOCATIONS_NOT_SAVED_MESSAGE
}

export function isMissingListingLocations(error) {
  const code = String(error?.code ?? '')
  const message = String(error?.message ?? '')
  const aboutLocations = /listing_locations|location_id|multi_location|listing_location_details/.test(message)
  // A missing table: these helpers only ever read listing_locations.
  if (code === 'PGRST205' || code === '42P01') return true
  // A missing column or function: only when it is one of 00059's.
  if (code === '42703' || code === 'PGRST202' || code === '42883') return aboutLocations
  return aboutLocations && /does not exist|schema cache|Could not find/i.test(message)
}

function newKey() {
  return crypto.randomUUID?.() ?? `location-${Date.now()}-${Math.random()}`
}

export function emptyLocation(overrides = {}) {
  return {
    key: newKey(),
    id: null,
    label: '',
    area: '',
    fullAddress: '',
    arrivalInstructions: '',
    ...overrides,
  }
}

/** "Jurong studio · Jurong East", or whichever of the two the location has. */
export function locationName(location) {
  const label = String(location?.label ?? '').trim()
  const area = String(location?.area ?? '').trim()
  if (label && area && label.toLowerCase() !== area.toLowerCase()) return `${label} · ${area}`
  return label || area
}

function editorLocation(row) {
  return emptyLocation({
    key: row.id,
    id: row.id,
    label: row.label ?? '',
    area: row.area ?? '',
    fullAddress: typeof row.full_address === 'string' ? row.full_address : '',
    arrivalInstructions: typeof row.arrival_instructions === 'string' ? row.arrival_instructions : '',
  })
}

function byPosition(a, b) {
  return (
    (Number(a.position) || 0) - (Number(b.position) || 0) ||
    String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''))
  )
}

/**
 * The editor's locations for one listing, as its host. Location 1 is the
 * primary row (its fields are the listing's own); the rest are extras.
 * `multiLocation` is the listing's own column, read with the listing; when
 * it is not a boolean the column is missing, and so is 00059.
 * { available, loaded, multiLocation, primaryId, primaryLabel, extras }.
 */
export async function loadLocationsForEditor(client, listingId, { multiLocation } = {}) {
  const empty = { available: false, loaded: false, multiLocation: false, primaryId: null, primaryLabel: '', extras: [] }
  if (typeof multiLocation !== 'boolean') return empty
  try {
    const details = await client.rpc('listing_location_details', { p_listing_id: listingId })
    if (isMissingListingLocations(details.error)) return empty
    if (details.error) return { ...empty, available: true }
    const active = (details.data ?? []).filter((row) => row.is_active !== false).sort(byPosition)
    const [primary, ...rest] = active
    return {
      available: true,
      loaded: true,
      multiLocation,
      primaryId: primary?.id ?? null,
      primaryLabel: primary?.label ?? '',
      extras: rest.map(editorLocation),
    }
  } catch {
    return { ...empty, available: true }
  }
}

/** Whether 00059 is applied, for the create wizard. */
export async function listingLocationsAvailable(client) {
  try {
    const { error } = await client.from('listing_locations').select('id').limit(1)
    return !error || !isMissingListingLocations(error)
  } catch {
    return false
  }
}

const PUBLIC_COLUMNS = 'id, listing_id, label, area, position, is_active'

/**
 * Public location rows for listings: no address. `activeOnly` for pickers;
 * Hosting wants removed ones too, to name old sessions. { rows, available, error }.
 */
export async function queryListingLocations(client, listingIds, { activeOnly = false } = {}) {
  const ids = [...new Set((listingIds ?? []).filter(Boolean))]
  if (ids.length === 0) return { rows: [], available: true, error: null }
  try {
    let query = client.from('listing_locations').select(PUBLIC_COLUMNS).in('listing_id', ids)
    if (activeOnly) query = query.eq('is_active', true)
    const { data, error } = await query.order('position', { ascending: true })
    if (error && isMissingListingLocations(error)) return { rows: [], available: false, error: null }
    if (error) return { rows: [], available: true, error }
    return { rows: data ?? [], available: true, error: null }
  } catch (error) {
    return { rows: [], available: true, error }
  }
}

function publicLocation(row) {
  return {
    id: row.id,
    listingId: row.listing_id,
    label: row.label ?? '',
    area: row.area ?? '',
    name: locationName(row),
    isActive: row.is_active !== false,
  }
}

/** Active locations grouped by listing id, first location first. */
export function locationsByListing(rows) {
  const grouped = {}
  for (const row of [...(rows ?? [])].sort(byPosition)) {
    if (row.is_active === false) continue
    ;(grouped[row.listing_id] ??= []).push(publicLocation(row))
  }
  return grouped
}

/**
 * Location names by id, only for listings that run at several places: a
 * one-location listing never shows a location line.
 */
export function locationNamesById(rows) {
  const grouped = locationsByListing(rows)
  const names = {}
  for (const row of rows ?? []) {
    if ((grouped[row.listing_id]?.length ?? 0) > 1) names[row.id] = locationName(row)
  }
  return names
}

/** Upcoming sessions per location id. */
export function datesByLocation(sessions, now = Date.now()) {
  const counts = {}
  for (const session of sessions ?? []) {
    if (!session.location_id || session.status === 'cancelled') continue
    if (new Date(session.starts_at).getTime() <= now) continue
    counts[session.location_id] = (counts[session.location_id] ?? 0) + 1
  }
  return counts
}

/** Hints for locations 2 to 4, keyed location-<index>-<field>. */
export function locationFieldHints(extras) {
  const hints = {}
  ;(extras ?? []).forEach((location, index) => {
    if (!location.area) hints[`location-${index}-area`] = LOCATION_HINTS.area
    if (!location.fullAddress.trim()) hints[`location-${index}-fullAddress`] = LOCATION_HINTS.fullAddress
  })
  return hints
}

export function locationDraftFingerprint(location) {
  return {
    id: location.id ?? null,
    label: location.label,
    area: location.area,
    fullAddress: location.fullAddress,
    arrivalInstructions: location.arrivalInstructions,
  }
}

/** Text-only copies for the create wizard's browser draft. */
export function draftLocations(value) {
  if (!Array.isArray(value)) return []
  const text = (item, key) => (typeof item?.[key] === 'string' ? item[key] : '')
  return value
    .slice(0, MAX_LOCATIONS - 1)
    .map((item) =>
      emptyLocation({
        label: text(item, 'label'),
        area: text(item, 'area'),
        fullAddress: text(item, 'fullAddress'),
        arrivalInstructions: text(item, 'arrivalInstructions'),
      }),
    )
}

function columns(location, position) {
  const arrival = location.arrivalInstructions.trim()
  return {
    label: location.label.trim().slice(0, LOCATION_LABEL_MAX) || null,
    area: location.area || null,
    full_address: location.fullAddress.trim() || null,
    arrival_instructions: arrival || null,
    position,
  }
}

/**
 * Write locations 2 to 4, and location 1's label. Order matters for the
 * database's checks: multiple locations go on before a second location is
 * added, removed locations go first so the cap of 4 never trips, and
 * multiple locations go off only after the others are gone. Returns ids it
 * inserted (by editor key) even on a partial failure, so a retry updates
 * instead of duplicating.
 */
export async function saveListingLocations({
  client,
  listingId,
  multiLocation,
  savedMultiLocation = false,
  primaryId = null,
  primaryLabel = '',
  savedPrimaryLabel = '',
  extras = [],
  existing = [],
}) {
  const insertedIds = {}
  if (multiLocation && !savedMultiLocation) {
    const { error } = await client.from('listings').update({ multi_location: true }).eq('id', listingId)
    if (error) return { error, insertedIds }
  }

  const kept = new Set(extras.map((location) => location.id).filter(Boolean))
  for (const row of existing.filter((item) => item.id && !kept.has(item.id))) {
    const { error } = await client.from('listing_locations').update({ is_active: false }).eq('id', row.id)
    if (error) return { error, insertedIds }
  }

  const label = primaryLabel.trim().slice(0, LOCATION_LABEL_MAX)
  if (primaryId && label !== savedPrimaryLabel.trim()) {
    const { error } = await client
      .from('listing_locations')
      .update({ label: label || null })
      .eq('id', primaryId)
    if (error) return { error, insertedIds }
  }

  for (let index = 0; index < extras.length; index += 1) {
    const location = extras[index]
    const payload = columns(location, index + 1)
    if (location.id) {
      const { error } = await client.from('listing_locations').update(payload).eq('id', location.id)
      if (error) return { error, insertedIds }
    } else {
      const { data, error } = await client
        .from('listing_locations')
        .insert({ listing_id: listingId, ...payload })
        .select('id')
        .single()
      if (error) return { error, insertedIds }
      if (data?.id) insertedIds[location.key] = data.id
    }
  }

  if (!multiLocation && savedMultiLocation) {
    const { error } = await client.from('listings').update({ multi_location: false }).eq('id', listingId)
    if (error) return { error, insertedIds }
  }
  return { error: null, insertedIds }
}

/** The new listing's first location, made by the database from its own columns. */
export async function primaryLocationId(client, listingId) {
  const { data, error } = await client
    .from('listing_locations')
    .select('id')
    .eq('listing_id', listingId)
    .eq('is_active', true)
    .order('position', { ascending: true })
    .limit(1)
  if (error) return null
  return data?.[0]?.id ?? null
}
