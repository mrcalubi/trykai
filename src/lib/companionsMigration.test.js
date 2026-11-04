import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const dir = resolve(import.meta.dirname, '../../supabase/migrations')
const migration = readFileSync(resolve(dir, '00050_booking_companions.sql'), 'utf8')
const check = readFileSync(
  resolve(import.meta.dirname, '../../supabase/tests/booking_companions_check.sql'),
  'utf8',
)

function body(name) {
  const start = migration.indexOf(`function public.${name}(`)
  expect(start).toBeGreaterThan(-1)
  return migration.slice(start, migration.indexOf('$$;', start))
}

describe('00050 booking companions', () => {
  it('is the only 00050', () => {
    expect(readdirSync(dir).filter((name) => name.startsWith('00050_'))).toHaveLength(1)
  })

  it('keeps seats and join codes closed to clients', () => {
    expect(migration).toMatch(/revoke all on table public\.booking_guests from public, anon, authenticated;/)
    expect(migration).toMatch(/revoke all on table public\.booking_join_codes from public, anon, authenticated;/)
    expect(migration).toMatch(/alter table public\.booking_guests enable row level security;/)
    expect(migration).toMatch(/alter table public\.booking_join_codes enable row level security;/)
    expect(migration).toMatch(/unique \(booking_id, user_id\)/)
  })

  it('locks the booking row while claiming so two friends cannot take the last seat', () => {
    expect(body('claim_booking_seat')).toMatch(/for update of b/)
    expect(body('claim_booking_seat')).toMatch(/raise exception 'full'/)
    expect(body('claim_booking_seat')).toMatch(/v_uid = v_host_id/)
  })

  it('never gives a friend money fields', () => {
    expect(body('companion_booking')).not.toMatch(/total_amount|platform_fee|refund_amount|payment_rail|stripe_/)
    expect(body('my_companion_bookings')).not.toMatch(/total_amount|platform_fee|refund_amount|payment_rail|stripe_/)
    expect(body('join_preview')).not.toMatch(/full_address|total_amount|price_per_person/)
  })

  it('opens the address, directions and day-of number to confirmed friends only', () => {
    for (const name of ['listing_address', 'listing_arrival_instructions']) {
      expect(body(name)).toMatch(/b\.status = 'confirmed'/)
      expect(body(name)).toMatch(/is_booking_companion\(b\.id, auth\.uid\(\)\)/)
    }
    expect(body('booking_host_contact')).toMatch(/is_booking_companion\(b\.id, auth\.uid\(\)\)/)
    expect(body('booking_host_contact')).toMatch(/b\.status = 'confirmed'/)
  })

  it('lets a host review a friend on the booking, and reveals with the booker pair', () => {
    expect(body('post_review')).toMatch(/is_booking_companion\(p_booking_id, p_reviewee_id\)/)
    expect(body('reviews_reveal_when_both')).toMatch(/where booking_id = new\.booking_id\s+and revealed_at is null/)
  })

  it('recreates host_reviews_due with booked_by and restores its grants', () => {
    expect(migration).toMatch(/drop function if exists public\.host_reviews_due\(\);/)
    expect(body('host_reviews_due')).toMatch(/booked_by text/)
    expect(migration).toMatch(
      /revoke all on function public\.host_reviews_due\(\) from public, anon;\s*grant execute on function public\.host_reviews_due\(\) to authenticated;/,
    )
  })

  it('counts a friend’s sessions as attended', () => {
    expect(body('my_profile_stats')).toMatch(/from public\.booking_guests bg\s+where bg\.booking_id = b\.id and bg\.user_id = auth\.uid\(\)/)
  })

  it('ships a staging check that rolls back', () => {
    expect(check.trim().startsWith('--')).toBe(true)
    expect(check).toMatch(/^begin;$/m)
    expect(check.trim().endsWith('rollback;')).toBe(true)
  })
})
