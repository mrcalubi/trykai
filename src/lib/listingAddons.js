import { formatCents } from './cancellationPolicy'
import { photoFromRemote, uploadListingPhotos } from './listingPhotos'
import { addonGuestUnitCents } from './pricing'

export const MAX_LISTING_ADDONS = 3
export const ADDON_NAME_MAX = 60
export const ADDON_DESCRIPTION_MAX = 140
export const ADDON_PRICE_MIN_DOLLARS = 1
export const ADDON_PRICE_MAX_DOLLARS = 500

export const ADDON_IDEAS = [
  'Premium materials',
  'Take-home kit',
  'Gift wrap and a card',
  'Photos of you making it',
  'Drinks and snacks',
  'A second piece to make',
  'Extra 30 min one-on-one',
]

export const OCCASION_IDEAS = [
  'Birthday surprise',
  'Anniversary upgrades',
  'Date-night setup',
  'Proposal help',
]

export const ADDON_HINTS = {
  name: 'Give this add-on a name.',
  price: 'Set what you get, from S$1 to S$500 in whole dollars.',
  sessionLimit: 'Limit per session is 1 to 99 units.',
}

export function isMissingAddonsTable(error) {
  const code = String(error?.code ?? '')
  if (code === 'PGRST205' || code === '42P01') return true
  const message = String(error?.message ?? '')
  return /PGRST205/.test(message) || /42P01/.test(message)
}

export function sgd(cents) {
  return `S${formatCents(cents)}`
}

export function parseAddonPriceCents(value) {
  if (value == null || String(value).trim() === '') return null
  const dollars = Number(String(value).trim())
  if (!Number.isFinite(dollars) || !Number.isInteger(dollars)) return null
  if (dollars < ADDON_PRICE_MIN_DOLLARS || dollars > ADDON_PRICE_MAX_DOLLARS) return null
  return dollars * 100
}

function newKey() {
  return crypto.randomUUID?.() ?? `addon-${Date.now()}-${Math.random()}`
}

export function emptyAddon(overrides = {}) {
  return {
    key: newKey(),
    id: null,
    name: '',
    description: '',
    price: '',
    unit: 'person',
    sessionLimitEnabled: false,
    sessionLimit: '',
    photo: null,
    ...overrides,
  }
}

export function addonFromRow(row) {
  return emptyAddon({
    key: row.id,
    id: row.id,
    name: row.name ?? '',
    description: row.description ?? '',
    price: row.price_cents != null ? String(row.price_cents / 100) : '',
    unit: row.unit === 'booking' ? 'booking' : 'person',
    sessionLimitEnabled: row.session_limit != null,
    sessionLimit: row.session_limit != null ? String(row.session_limit) : '',
    photo: row.photo_url ? photoFromRemote(row.photo_url) : null,
  })
}

export function draftAddons(value) {
  if (!Array.isArray(value)) return []
  return value.slice(0, MAX_LISTING_ADDONS).map((row) =>
    emptyAddon({
      key: typeof row?.key === 'string' ? row.key : newKey(),
      id: typeof row?.id === 'string' ? row.id : null,
      name: typeof row?.name === 'string' ? row.name : '',
      description: typeof row?.description === 'string' ? row.description : '',
      price: typeof row?.price === 'string' ? row.price : '',
      unit: row?.unit === 'booking' ? 'booking' : 'person',
      sessionLimitEnabled: Boolean(row?.sessionLimitEnabled),
      sessionLimit: typeof row?.sessionLimit === 'string' ? row.sessionLimit : '',
      photo: null,
    }),
  )
}

function photoFingerprint(photo) {
  if (!photo) return null
  return {
    id: photo.id,
    remoteUrl: photo.remoteUrl ?? null,
    file: photo.file ? `${photo.file.name}:${photo.file.size}:${photo.file.lastModified}` : null,
  }
}

export function addonDraftFingerprint(addon) {
  return {
    id: addon.id ?? null,
    name: addon.name,
    description: addon.description,
    price: addon.price,
    unit: addon.unit,
    sessionLimitEnabled: Boolean(addon.sessionLimitEnabled),
    sessionLimit: addon.sessionLimitEnabled ? addon.sessionLimit : '',
    photo: photoFingerprint(addon.photo),
  }
}

export function addonsHaveAnswers(addons) {
  return (addons ?? []).some(
    (addon) =>
      Boolean(addon?.name?.trim()) ||
      Boolean(addon?.description?.trim()) ||
      Boolean(String(addon?.price ?? '').trim()),
  )
}

export function addonFieldHints(addons) {
  const hints = {}
  ;(addons ?? []).forEach((addon, index) => {
    if (!addon.name.trim()) hints[`addon-${index}-name`] = ADDON_HINTS.name
    if (parseAddonPriceCents(addon.price) == null) hints[`addon-${index}-price`] = ADDON_HINTS.price
    if (addon.sessionLimitEnabled) {
      const limit = parseInt(addon.sessionLimit, 10)
      if (!Number.isInteger(limit) || limit < 1 || limit > 99) {
        hints[`addon-${index}-limit`] = ADDON_HINTS.sessionLimit
      }
    }
  })
  return hints
}

export function addonLivePill(addon) {
  const hostCents = parseAddonPriceCents(addon?.price)
  if (hostCents == null) return ''
  return `You get ${sgd(hostCents)} · guests pay ${sgd(addonGuestUnitCents(hostCents))}`
}

export function addonEarningsLine(addon) {
  const hostCents = parseAddonPriceCents(addon?.price)
  const name = addon?.name?.trim()
  if (!name || hostCents == null) return ''
  const extra = sgd(hostCents * 2)
  if (addon.unit === 'booking') {
    return `If 2 bookings a session add ${name}, that's ${extra} more per session for you.`
  }
  return `If 2 guests a session pick ${name}, that's ${extra} more per session for you.`
}

export function startAddonFromIdea(addons, name, unit = 'person') {
  const list = addons ?? []
  const blank = list.findIndex(
    (addon) =>
      !addon.name.trim() &&
      !addon.description.trim() &&
      !String(addon.price).trim() &&
      !addon.photo,
  )
  if (blank >= 0) {
    const next = [...list]
    next[blank] = { ...next[blank], name, unit }
    return next
  }
  if (list.length >= MAX_LISTING_ADDONS) return list
  return [...list, emptyAddon({ name, unit })]
}

export async function probeListingAddonsTable(client) {
  const { error } = await client.from('listing_addons').select('id').limit(1)
  return !isMissingAddonsTable(error)
}

export async function loadListingAddons(client, listingId) {
  const { data, error } = await client
    .from('listing_addons')
    .select('id, name, description, price_cents, unit, session_limit, photo_url, position, is_active')
    .eq('listing_id', listingId)
    .eq('is_active', true)
    .order('position', { ascending: true })
  if (isMissingAddonsTable(error)) {
    return { addons: [], available: false, loaded: true, error: null }
  }
  if (error) return { addons: [], available: true, loaded: false, error }
  return {
    addons: (data ?? []).map(addonFromRow),
    available: true,
    loaded: true,
    error: null,
  }
}

async function photoUrlFor(addon, userId, storage) {
  if (addon.photo?.file) {
    const [url] = await uploadListingPhotos([addon.photo], userId, storage)
    return url ?? null
  }
  return addon.photo?.remoteUrl ?? null
}

function writePayload(addon, position, photoUrl) {
  return {
    name: addon.name.trim(),
    description: (addon.description ?? '').trim().slice(0, ADDON_DESCRIPTION_MAX),
    price_cents: parseAddonPriceCents(addon.price),
    unit: addon.unit === 'booking' ? 'booking' : 'person',
    session_limit: addon.sessionLimitEnabled ? parseInt(addon.sessionLimit, 10) : null,
    photo_url: photoUrl,
    position,
  }
}

export async function saveListingAddons({
  client,
  listingId,
  addons,
  existing = [],
  userId,
  storage,
}) {
  const keptIds = new Set((addons ?? []).map((addon) => addon.id).filter(Boolean))
  const toRemove = existing.filter((row) => row.id && !keptIds.has(row.id))

  for (const row of toRemove) {
    const { error } = await client
      .from('listing_addons')
      .update({ is_active: false })
      .eq('id', row.id)
    if (error) return { error }
  }

  for (let index = 0; index < (addons ?? []).length; index += 1) {
    const addon = addons[index]
    let photoUrl
    try {
      photoUrl = await photoUrlFor(addon, userId, storage)
    } catch (error) {
      return { error }
    }
    const payload = writePayload(addon, index, photoUrl)
    if (addon.id) {
      const { error } = await client.from('listing_addons').update(payload).eq('id', addon.id)
      if (error) return { error }
    } else {
      const { error } = await client
        .from('listing_addons')
        .insert({ listing_id: listingId, ...payload })
      if (error) return { error }
    }
  }

  return { error: null }
}
