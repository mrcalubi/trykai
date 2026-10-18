import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { hoursFromNow } from '../test/fixtures'
import {
  SESSION_HAS_BOOKINGS,
  SESSION_HAS_BOOKINGS_MESSAGE,
  firstSpotsResult,
  floorSessionSpots,
  formatListingSpotsMessage,
  isSessionHasBookingsError,
} from './listingSpots'

const migration = readFileSync(
  resolve(import.meta.dirname, '../../supabase/migrations/00024_session_edit_and_listing_spots.sql'),
  'utf8',
)
const checkout = readFileSync(
  resolve(import.meta.dirname, '../../supabase/functions/create-payment-intent/index.ts'),
  'utf8',
)

describe('floorSessionSpots', () => {
  it('uses the listing number when nothing is booked', () => {
    expect(floorSessionSpots(4, 0, 0)).toEqual({
      spots_total: 4,
      spots_remaining: 4,
      held: false,
      booked: 0,
    })
  })

  it('will not shrink below confirmed guests', () => {
    expect(floorSessionSpots(4, 5, 0)).toEqual({
      spots_total: 5,
      spots_remaining: 0,
      held: true,
      booked: 5,
    })
  })

  it('holds room for a pending checkout as well as confirmed guests', () => {
    expect(floorSessionSpots(4, 3, 2)).toEqual({
      spots_total: 5,
      spots_remaining: 2,
      held: true,
      booked: 5,
    })
  })

  it('keeps remaining as total minus confirmed when shrinking with room', () => {
    expect(floorSessionSpots(4, 2, 0)).toEqual({
      spots_total: 4,
      spots_remaining: 2,
      held: false,
      booked: 2,
    })
  })
})

describe('set_listing_spots result copy', () => {
  it('counts every future session that was written', () => {
    expect(formatListingSpotsMessage({ updated: 3, held: [] })).toBe(
      'Updated 3 future sessions.',
    )
    expect(formatListingSpotsMessage({ updated: 1, held: [] })).toBe(
      'Updated 1 future session.',
    )
  })

  it('lists sessions that could not drop to the new number', () => {
    const startsAt = hoursFromNow(48)
    const message = formatListingSpotsMessage({
      updated: 2,
      held: [{ session_id: 's-1', starts_at: startsAt, spots_total: 5, booked: 5 }],
    })
    expect(message).toMatch(/^Updated 2 future sessions\. /)
    expect(message).toMatch(/kept 5 spots because of existing bookings\.$/)
  })

  it('reads a table-valued RPC row or a jsonb object', () => {
    expect(firstSpotsResult([{ updated: 1, held: [] }])).toEqual({ updated: 1, held: [] })
    expect(firstSpotsResult({ updated: 1, held: [] })).toEqual({ updated: 1, held: [] })
  })
})

describe('edit_open_session race', () => {
  it('maps session_has_bookings to the host-facing copy', () => {
    expect(isSessionHasBookingsError(SESSION_HAS_BOOKINGS)).toBe(true)
    expect(isSessionHasBookingsError(`RPC: ${SESSION_HAS_BOOKINGS}`)).toBe(true)
    expect(isSessionHasBookingsError('not allowed')).toBe(false)
    expect(SESSION_HAS_BOOKINGS_MESSAGE).toBe(
      "Someone just started booking this session, so it can't be edited.",
    )
  })
})

describe('00024 set_listing_spots', () => {
  it('locks the listing and its future sessions before writing spots', () => {
    expect(migration).toMatch(/create or replace function public\.set_listing_spots/)
    expect(migration).toMatch(/from public\.listings[\s\S]*for update/)
    expect(migration).toMatch(/from public\.sessions[\s\S]*starts_at > now\(\)[\s\S]*for update/)
    expect(migration).toMatch(/v_listing\.host_id is distinct from auth\.uid\(\)/)
    expect(migration).toMatch(/set max_guests = p_spots/)
    expect(migration).toMatch(/v_total := greatest\(p_spots, v_floor\)/)
    expect(migration).toMatch(/v_floor := v_booked \+ v_pending/)
    expect(migration).toMatch(/status = 'pending'/)
    expect(migration).toMatch(/'held', v_held/)
    expect(migration).toMatch(/grant execute on function public\.set_listing_spots/)
  })
})

describe('00024 edit_open_session', () => {
  it('locks the session and refuses any booking on that row', () => {
    expect(migration).toMatch(/create or replace function public\.edit_open_session/)
    expect(migration).toMatch(/from public\.sessions[\s\S]*where id = p_session_id[\s\S]*for update/)
    expect(migration).toMatch(/raise exception 'session_has_bookings'/)
    expect(migration).toMatch(/status in \('pending', 'confirmed'\)/)
    expect(migration).toMatch(/p_starts_at <= now\(\)/)
    expect(migration).toMatch(/session_overlap_message/)
    expect(migration).toMatch(/v_listing\.host_id is distinct from auth\.uid\(\)/)
  })

  it('serialises checkout against the same session row lock', () => {
    expect(migration).toMatch(/create trigger bookings_lock_session/)
    expect(migration).toMatch(/before insert on public\.bookings/)
    expect(migration).toMatch(/lock_session_on_booking/)
    expect(migration).toMatch(/where id = new\.session_id[\s\S]*for update/)
    expect(checkout).toMatch(/The insert trigger locked the session row/)
    expect(checkout).toMatch(/select\('status, starts_at, spots_remaining'\)/)
    expect(checkout).toMatch(/freshSession\.starts_at/)
  })

  it('revokes table UPDATE on listings and re-grants only Edit listing columns', () => {
    expect(migration).toMatch(
      /revoke update \(starts_at, duration_mins, spots_total, spots_remaining\)/,
    )
    expect(migration).toMatch(/revoke update on table public\.listings from public, anon, authenticated/)
    expect(migration).toMatch(
      /grant update \(\s*title,\s*description,\s*category,\s*price_per_person,\s*duration_mins,\s*group_pricing,\s*area,\s*full_address,\s*whats_provided,\s*photo_urls\s*\)/,
    )
    expect(migration).not.toMatch(/grant update \([^)]*max_guests/)
    expect(migration).toMatch(/revoke delete on table public\.listings from public, anon, authenticated/)
    expect(migration).not.toMatch(/revoke insert on table public\.listings/)
    expect(migration).not.toMatch(/revoke insert on table public\.sessions/)
  })
})
