// Where a session runs (00059, listing locations).
//
// Loaded on its own, after a function's main read and never inside it, so a
// database without listing_locations, or any read error, leaves the email
// exactly as it was before: the listing's own address, no location line.
// The listing columns mirror the first location, so for a listing with one
// location both give the same address.

// Same shape as telegram.ts: the service-role client, or a test double.
// deno-lint-ignore no-explicit-any
export type LocationsAdmin = { from: (table: string) => any }

export type SessionPlace = {
  locationId: string
  label: string
  area: string
  fullAddress: string
  arrivalInstructions: string
  /** The listing runs at several locations at once (listings.multi_location). */
  multiLocation: boolean
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function uniqueIds(values: unknown[]): string[] {
  return [...new Set(values.filter((value): value is string => typeof value === 'string' && value !== ''))]
}

/** "Jurong studio · Jurong East", or whichever of the two the location has. */
export function placeName(place: Pick<SessionPlace, 'label' | 'area'> | null | undefined): string {
  if (!place) return ''
  const label = text(place.label)
  const area = text(place.area)
  if (label && area && label.toLowerCase() !== area.toLowerCase()) return `${label} · ${area}`
  return label || area
}

/**
 * The location line for emails and Telegram. Only for a listing that runs at
 * several places: with one location the address already says where, and
 * nothing changes for hosts who never turned locations on.
 */
export function locationLine(place: SessionPlace | null | undefined): string {
  return place?.multiLocation ? placeName(place) : ''
}

/** The address and directions for a session: its own location's, else the listing's. */
export function sessionAddress(
  place: SessionPlace | null | undefined,
  listing: { full_address?: unknown; arrival_instructions?: unknown } | null | undefined,
): { fullAddress: string; arrivalInstructions: string } {
  if (place) return { fullAddress: place.fullAddress, arrivalInstructions: place.arrivalInstructions }
  return {
    fullAddress: text(listing?.full_address),
    arrivalInstructions: text(listing?.arrival_instructions),
  }
}

/** Each session's location, by session id. Empty on any failure. */
export async function loadSessionPlaces(
  admin: LocationsAdmin,
  sessionIds: unknown[],
): Promise<Map<string, SessionPlace>> {
  const places = new Map<string, SessionPlace>()
  const ids = uniqueIds(sessionIds)
  if (ids.length === 0) return places
  try {
    const { data: sessions, error } = await admin.from('sessions').select('id, location_id').in('id', ids)
    if (error || !Array.isArray(sessions)) return places

    const locationBySession = new Map<string, string>()
    for (const row of sessions as Array<Record<string, unknown>>) {
      if (typeof row?.id === 'string' && typeof row.location_id === 'string') {
        locationBySession.set(row.id, row.location_id)
      }
    }
    const locationIds = uniqueIds([...locationBySession.values()])
    if (locationIds.length === 0) return places

    // Plain reads, no embedding: sessions points at both listings and
    // listing_locations, and an embed between those two must never be ambiguous.
    const { data: locations, error: locationError } = await admin
      .from('listing_locations')
      .select('id, listing_id, label, area, full_address, arrival_instructions')
      .in('id', locationIds)
    if (locationError || !Array.isArray(locations)) return places
    const locationRows = locations as Array<Record<string, unknown>>

    // If this read fails the address is still the session's own; only the
    // location line is left out.
    const multiListings = new Set<string>()
    const listingIds = uniqueIds(locationRows.map((row) => row?.listing_id))
    if (listingIds.length > 0) {
      const { data: listings, error: listingError } = await admin
        .from('listings')
        .select('id, multi_location')
        .in('id', listingIds)
      if (!listingError && Array.isArray(listings)) {
        for (const row of listings as Array<Record<string, unknown>>) {
          if (typeof row?.id === 'string' && row.multi_location === true) multiListings.add(row.id)
        }
      }
    }

    const byId = new Map<string, SessionPlace>()
    for (const row of locationRows) {
      if (typeof row?.id !== 'string') continue
      byId.set(row.id, {
        locationId: row.id,
        label: text(row.label),
        area: text(row.area),
        fullAddress: text(row.full_address),
        arrivalInstructions: text(row.arrival_instructions),
        multiLocation: typeof row.listing_id === 'string' && multiListings.has(row.listing_id),
      })
    }
    for (const [sessionId, locationId] of locationBySession) {
      const place = byId.get(locationId)
      if (place) places.set(sessionId, place)
    }
    return places
  } catch (err) {
    console.error('loadSessionPlaces failed', err instanceof Error ? err.message : err)
    return places
  }
}

export async function loadSessionPlace(
  admin: LocationsAdmin,
  sessionId: unknown,
): Promise<SessionPlace | null> {
  if (typeof sessionId !== 'string' || !sessionId) return null
  return (await loadSessionPlaces(admin, [sessionId])).get(sessionId) ?? null
}

/** Each listing's active locations by name, first location first. Empty on any failure. */
export async function loadListingPlaceNames(
  admin: LocationsAdmin,
  listingIds: unknown[],
): Promise<Map<string, string[]>> {
  const names = new Map<string, string[]>()
  const ids = uniqueIds(listingIds)
  if (ids.length === 0) return names
  try {
    const { data, error } = await admin
      .from('listing_locations')
      .select('listing_id, label, area, position, created_at, is_active')
      .in('listing_id', ids)
    if (error || !Array.isArray(data)) return names
    const rows = (data as Array<Record<string, unknown>>)
      .filter((row) => row?.is_active === true && typeof row.listing_id === 'string')
      .sort(
        (a, b) =>
          (Number(a.position) || 0) - (Number(b.position) || 0) ||
          String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')),
      )
    for (const row of rows) {
      const name = placeName({ label: text(row.label), area: text(row.area) })
      if (!name) continue
      const list = names.get(row.listing_id as string) ?? []
      list.push(name)
      names.set(row.listing_id as string, list)
    }
    return names
  } catch (err) {
    console.error('loadListingPlaceNames failed', err instanceof Error ? err.message : err)
    return names
  }
}
