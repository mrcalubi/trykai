import { photoFromRemote, uploadListingPhotos } from './listingPhotos'

/**
 * Session types (00056). A listing can offer up to 4 types; the host picks a
 * type for each batch of dates, and guests pick a type by picking a date.
 * Every type costs the listing's price for now.
 */

export const MAX_SESSION_TYPES = 4
export const SESSION_TYPE_NAME_MAX = 40
export const SESSION_TYPE_DESCRIPTION_MAX = 140

export const SESSION_TYPE_HINTS = {
  name: 'Give this type a name.',
}

export const SESSION_TYPES_NOT_SAVED_MESSAGE =
  "Your listing saved, but your session types didn't. Try Save again."

export function isMissingSessionTypes(error) {
  const code = String(error?.code ?? '')
  if (code === 'PGRST205' || code === '42P01' || code === '42703') return true
  const message = String(error?.message ?? '')
  return /listing_session_types|type_id/.test(message) && /does not exist|schema cache|Could not find/i.test(message)
}

function newKey() {
  return crypto.randomUUID?.() ?? `type-${Date.now()}-${Math.random()}`
}

export function emptySessionType(overrides = {}) {
  return { key: newKey(), id: null, name: '', description: '', photo: null, ...overrides }
}

/** Editor shape from a database row. */
export function sessionTypeFromRow(row) {
  return emptySessionType({
    key: row.id,
    id: row.id,
    name: row.name ?? '',
    description: row.description ?? '',
    photo: row.photo_url ? photoFromRemote(row.photo_url) : null,
  })
}

/** Guest-facing shape. */
export function publicSessionType(row) {
  return {
    id: row.id,
    name: row.name ?? '',
    description: row.description ?? '',
    photoUrl: row.photo_url || null,
    isActive: row.is_active !== false,
  }
}

function photoFingerprint(photo) {
  if (!photo) return null
  return {
    id: photo.id,
    remoteUrl: photo.remoteUrl ?? null,
    file: photo.file ? `${photo.file.name}:${photo.file.size}:${photo.file.lastModified}` : null,
  }
}

export function sessionTypeDraftFingerprint(type) {
  return {
    id: type.id ?? null,
    name: type.name,
    description: type.description,
    photo: photoFingerprint(type.photo),
  }
}

export function sessionTypeFieldHints(types) {
  const hints = {}
  ;(types ?? []).forEach((type, index) => {
    if (!type.name.trim()) hints[`type-${index}-name`] = SESSION_TYPE_HINTS.name
  })
  return hints
}

const COLUMNS = 'id, listing_id, name, description, photo_url, position, is_active'

/**
 * Types for listings. `activeOnly` for the host's editor and the Add sessions
 * form; the listing page and bookings want removed ones too, to name old
 * sessions. { rows, available, error }.
 */
export async function querySessionTypes(client, listingIds, { activeOnly = false } = {}) {
  const ids = [...new Set((listingIds ?? []).filter(Boolean))]
  if (ids.length === 0) return { rows: [], available: true, error: null }
  try {
    let query = client.from('listing_session_types').select(COLUMNS).in('listing_id', ids)
    if (activeOnly) query = query.eq('is_active', true)
    const { data, error } = await query.order('position', { ascending: true })
    if (error && isMissingSessionTypes(error)) return { rows: [], available: false, error: null }
    if (error) return { rows: [], available: true, error }
    return { rows: data ?? [], available: true, error: null }
  } catch (error) {
    return { rows: [], available: true, error }
  }
}

/** Host editor: this listing's active types. { types, available, loaded }. */
export async function loadSessionTypesForEditor(client, listingId) {
  const { rows, available, error } = await querySessionTypes(client, [listingId], { activeOnly: true })
  return { types: rows.map(sessionTypeFromRow), available, loaded: !error }
}

/** Listing page: { active: [...], byId: { id: type } } including removed types. */
export async function loadPublicSessionTypes(client, listingId) {
  const { rows } = await querySessionTypes(client, [listingId])
  const all = rows.map(publicSessionType)
  return { active: all.filter((type) => type.isActive), byId: Object.fromEntries(all.map((t) => [t.id, t])) }
}

/** Type names by id, for booking lists. {} when there are none or 00056 is missing. */
export async function sessionTypeNamesById(client, typeIds) {
  const ids = [...new Set((typeIds ?? []).filter(Boolean))]
  if (ids.length === 0) return {}
  try {
    const { data, error } = await client.from('listing_session_types').select('id, name').in('id', ids)
    if (error) return {}
    return Object.fromEntries((data ?? []).map((row) => [row.id, row.name]))
  } catch {
    return {}
  }
}

/** Active types grouped by listing id, for the Hosting page. */
export function typesByListing(rows) {
  const grouped = {}
  for (const row of rows ?? []) {
    if (row.is_active === false) continue
    ;(grouped[row.listing_id] ??= []).push(publicSessionType(row))
  }
  return grouped
}

/** Sessions that match the chosen type filter (null means all). */
export function sessionsOfType(sessions, typeId) {
  if (!typeId) return sessions ?? []
  return (sessions ?? []).filter((session) => session.type_id === typeId)
}

async function photoUrlFor(type, userId, storage) {
  if (type.photo?.file) {
    const [url] = await uploadListingPhotos([type.photo], userId, storage)
    return url ?? null
  }
  return type.photo?.remoteUrl ?? null
}

/**
 * Writes the editor's types. Removed ones are soft-deleted first so the
 * 4-active cap never trips mid-save. Returns ids it inserted (by editor key)
 * even on a partial failure, so a retry updates instead of duplicating.
 */
export async function saveSessionTypes({ client, listingId, types, existing = [], userId, storage }) {
  const insertedIds = {}
  const keptIds = new Set((types ?? []).map((type) => type.id).filter(Boolean))
  for (const row of existing.filter((item) => item.id && !keptIds.has(item.id))) {
    const { error } = await client.from('listing_session_types').update({ is_active: false }).eq('id', row.id)
    if (error) return { error, insertedIds }
  }

  for (let index = 0; index < (types ?? []).length; index += 1) {
    const type = types[index]
    let photoUrl
    try {
      photoUrl = await photoUrlFor(type, userId, storage)
    } catch (error) {
      return { error, insertedIds }
    }
    const payload = {
      name: type.name.trim().slice(0, SESSION_TYPE_NAME_MAX),
      description: (type.description ?? '').trim().slice(0, SESSION_TYPE_DESCRIPTION_MAX),
      photo_url: photoUrl,
      position: index,
    }
    if (type.id) {
      const { error } = await client.from('listing_session_types').update(payload).eq('id', type.id)
      if (error) return { error, insertedIds }
    } else {
      const { data, error } = await client
        .from('listing_session_types')
        .insert({ listing_id: listingId, ...payload })
        .select('id')
        .single()
      if (error) return { error, insertedIds }
      if (data?.id) insertedIds[type.key] = data.id
    }
  }
  return { error: null, insertedIds }
}
