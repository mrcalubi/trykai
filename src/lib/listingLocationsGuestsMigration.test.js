import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  resolve(import.meta.dirname, '../../supabase/migrations/00060_listing_locations_guests.sql'),
  'utf8',
)
const checkSql = readFileSync(
  resolve(import.meta.dirname, '../../supabase/tests/listing_locations_guests_check.sql'),
  'utf8',
)

describe('00060 listing locations, guest side', () => {
  it("shows a friend the booked place's area, never an address", () => {
    expect(migration).toMatch(
      /area := coalesce\(\s*\(select loc\.area from public\.listing_locations loc where loc\.id = v_session\.location_id\),\s*v_listing\.area\s*\)/,
    )
    expect(migration).not.toMatch(/full_address/)
    expect(migration).toMatch(/grant execute on function public\.join_preview\(text\) to anon, authenticated/)
  })

  it("gives a friend's booking its location", () => {
    expect(migration.match(/'location_id', s\.location_id/g)).toHaveLength(2)
    expect(migration).toMatch(/revoke all on function public\.companion_booking\(uuid\) from public, anon;/)
    expect(migration).toMatch(/revoke all on function public\.my_companion_bookings\(\) from public, anon;/)
  })

  it('has a rollback check', () => {
    expect(checkSql).toMatch(/^begin;/m)
    expect(checkSql).toMatch(/^rollback;/m)
    expect(checkSql).toContain('join_preview should show the area of the booked location')
    expect(checkSql).toContain('a friend on the booking should see the booked location address')
  })
})
