import { addonGuestUnitCents } from './pricing'
import { isMissingAddonsTable } from './listingAddons'

export const ADDON_NOTE_MAX = 120
export const ADDON_NOTE_HINT = 'For example, a name for the card.'

export function addonLineLabel(name, quantity) {
  return `${name} × ${quantity}`
}

export function guestAddonPriceLabel(addon) {
  const guest = addonGuestUnitCents(addon.price_cents)
  const unit = addon.unit === 'booking' ? 'per booking' : 'per person'
  return `+$${Math.round(guest / 100)} ${unit}`
}

export function remainingForAddon(addon, remainingById) {
  if (addon.session_limit == null) return null
  if (remainingById && remainingById[addon.id] != null) return Number(remainingById[addon.id])
  return addon.session_limit
}

export function maxAddonQuantity(addon, guestsCount, remaining) {
  if (addon.unit === 'booking') {
    return remaining == null ? 1 : Math.min(1, Math.max(0, remaining))
  }
  const guests = Math.max(0, guestsCount)
  const cap = remaining == null ? guests : Math.min(guests, remaining)
  return Math.max(0, cap)
}

export function clampAddonQuantities(quantities, addons, guestsCount, remainingById) {
  const next = { ...quantities }
  for (const addon of addons) {
    const remaining = remainingForAddon(addon, remainingById)
    const max = maxAddonQuantity(addon, guestsCount, remaining)
    const current = Number(next[addon.id]) || 0
    if (current > max) next[addon.id] = max
  }
  return next
}

export function pickedAddonLines(addons, quantities) {
  return (addons ?? [])
    .map((addon) => ({
      ...addon,
      quantity: Number(quantities?.[addon.id]) || 0,
      hostUnitCents: addon.price_cents,
    }))
    .filter((addon) => addon.quantity > 0)
}

export function checkoutAddonPayload(lines) {
  return lines.map((line) => ({ id: line.id, quantity: line.quantity }))
}

export function sumAddonLines(rows) {
  const totals = new Map()
  for (const row of rows ?? []) {
    const name = String(row.name ?? '').trim()
    const quantity = Number(row.quantity) || 0
    if (!name || quantity < 1) continue
    totals.set(name, (totals.get(name) ?? 0) + quantity)
  }
  return [...totals.entries()].map(([name, quantity]) => ({ name, quantity }))
}

export function prepareAddonsSentence(lines) {
  const summed = sumAddonLines(lines)
  if (!summed.length) return ''
  return `Add-ons to prepare: ${summed.map((line) => addonLineLabel(line.name, line.quantity)).join(', ')}.`
}

export function guestFirstName(name) {
  if (typeof name !== 'string') return 'a guest'
  const first = name.trim().split(/\s+/).filter(Boolean)[0]
  return first || 'a guest'
}

export async function loadBookingAddonRows(client, bookingIds) {
  const ids = [...new Set((bookingIds ?? []).filter(Boolean))]
  if (ids.length === 0) {
    return { rows: [], available: true }
  }
  const { data, error } = await client
    .from('booking_addons')
    .select('id, booking_id, name, quantity, unit, unit_guest_cents')
    .in('booking_id', ids)
  if (isMissingAddonsTable(error)) return { rows: [], available: false }
  if (error) return { rows: [], available: true, error }
  return { rows: data ?? [], available: true }
}

export async function loadBookingNotes(client, bookingIds) {
  const ids = [...new Set((bookingIds ?? []).filter(Boolean))]
  if (ids.length === 0) return { notes: {}, available: true }
  let { data, error } = await client.from('bookings').select('id, guest_id, addon_note').in('id', ids)
  if (error && /addon_note/.test(error.message ?? '')) {
    ;({ data, error } = await client.from('bookings').select('id, guest_id').in('id', ids))
  }
  if (error) return { notes: {}, available: false }
  const notes = {}
  for (const row of data ?? []) {
    notes[row.id] = {
      guestId: row.guest_id,
      note: typeof row.addon_note === 'string' && row.addon_note.trim() ? row.addon_note.trim() : null,
    }
  }
  return { notes, available: true }
}

export function sessionPrepareBoxes(sessions, addonRows, notesByBooking, namesByGuest) {
  const rowsByBooking = new Map()
  for (const row of addonRows ?? []) {
    const list = rowsByBooking.get(row.booking_id) ?? []
    list.push(row)
    rowsByBooking.set(row.booking_id, list)
  }
  const bySession = {}
  for (const session of sessions ?? []) {
    const confirmed = (session.bookings ?? []).filter((booking) => booking.status === 'confirmed')
    const lines = []
    const notes = []
    for (const booking of confirmed) {
      const addons = rowsByBooking.get(booking.id) ?? []
      lines.push(...addons)
      const info = notesByBooking?.[booking.id]
      if (info?.note) {
        const name = guestFirstName(namesByGuest?.[info.guestId] || namesByGuest?.[booking.guest_id])
        notes.push({ name, note: info.note })
      }
    }
    const summed = sumAddonLines(lines)
    if (!summed.length && !notes.length) continue
    bySession[session.id] = { lines: summed, notes }
  }
  return bySession
}
