import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  resolve(import.meta.dirname, '../../supabase/migrations/00057_one_session_per_time.sql'),
  'utf8',
)

describe('00057 one session per time', () => {
  it('refuses a repeat time instead of stacking spots', () => {
    expect(migration).toMatch(/create or replace function public\.add_listing_session\(/)
    expect(migration).toMatch(/raise exception 'That time is already on\.';/)
    expect(migration).toMatch(/raise exception 'That time already has a session of another type\.';/)
    expect(migration).not.toMatch(/spots_total = spots_total \+ p_spots/)
    expect(migration).not.toMatch(/'merged'/)
  })

  it('keeps the grants of 00056', () => {
    expect(migration).toMatch(
      /revoke all on function public\.add_listing_session\(uuid, timestamptz, integer, uuid\) from public, anon;\s*grant execute on function public\.add_listing_session\(uuid, timestamptz, integer, uuid\) to authenticated;/,
    )
  })

  it('brings stacked future sessions back to the listing spots, never below who booked', () => {
    expect(migration).toMatch(/s\.spots_total > l\.max_guests/)
    expect(migration).toMatch(/s\.starts_at > now\(\)/)
    expect(migration).toMatch(/s\.status in \('open', 'full'\)/)
    expect(migration).toMatch(/greatest\(v_session\.max_guests, v_booked \+ v_pending\)/)
  })
})
