import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  resolve(import.meta.dirname, '../../supabase/migrations/00059_listing_locations.sql'),
  'utf8',
)
const checkSql = readFileSync(
  resolve(import.meta.dirname, '../../supabase/tests/listing_locations_check.sql'),
  'utf8',
)

function functionBody(name) {
  const start = migration.indexOf(`create or replace function public.${name}(`)
  expect(start).toBeGreaterThan(-1)
  return migration.slice(start, migration.indexOf('$$;', start))
}

describe('00059 listing locations', () => {
  it('keeps the address and directions out of every client SELECT', () => {
    expect(migration).toMatch(/revoke all on table public\.listing_locations from public, anon, authenticated/)
    expect(migration).toMatch(
      /grant select \(\s*id, listing_id, label, area, position, is_active, created_at, updated_at\s*\) on table public\.listing_locations to anon, authenticated/,
    )
    expect(migration).not.toMatch(/grant select \([^)]*full_address[^)]*\) on table public\.listing_locations/)
    expect(migration).not.toMatch(/grant select \([^)]*arrival_instructions[^)]*\) on table public\.listing_locations/)
    expect(migration).not.toMatch(/grant select on table public\.listing_locations/)
    expect(migration).not.toMatch(/grant delete/)
  })

  it('lets only the host write, and never move a location to another listing', () => {
    expect(migration).toMatch(
      /grant insert \(listing_id, label, area, full_address, arrival_instructions, position\)\s+on table public\.listing_locations to authenticated/,
    )
    expect(migration).toMatch(
      /grant update \(label, area, full_address, arrival_instructions, position, is_active\)\s+on table public\.listing_locations to authenticated/,
    )
    expect(migration).toMatch(/'A location cannot move to another listing\.'/)
    expect(migration.match(/l\.host_id = auth\.uid\(\)/g)?.length).toBeGreaterThanOrEqual(3)
  })

  it('needs multiple locations turned on for a second location, and caps them at 4', () => {
    expect(migration).toMatch(/'Turn on multiple locations first\.'/)
    expect(migration).toMatch(/v_others >= 4 then\s*raise exception 'A listing can have at most 4 locations\.'/)
    expect(migration).toMatch(/'Remove the other locations first\.'/)
    expect(migration).toMatch(/'A listing needs at least one location\.'/)
    expect(migration).toMatch(/'Remove this location''s upcoming dates first\.'/)
  })

  it('records when multiple locations were turned on, and only by trigger', () => {
    expect(migration).toMatch(/grant update \(multi_location\) on table public\.listings to authenticated/)
    expect(migration).not.toMatch(/grant update \([^)]*multi_location_confirmed_at/)
    expect(functionBody('listings_guard_multi_location')).toMatch(/new\.multi_location_confirmed_at := now\(\)/)
  })

  it('gives every existing listing and session a location', () => {
    expect(migration).toMatch(
      /insert into public\.listing_locations \(listing_id, area, full_address, arrival_instructions, position\)\s+select l\.id, l\.area, l\.full_address, l\.arrival_instructions, 0/,
    )
    expect(migration).toMatch(/set location_id = public\.listing_primary_location\(s\.listing_id\)/)
    expect(migration).toMatch(/alter table public\.sessions alter column location_id set not null/)
  })

  it('keeps the listing columns equal to the first location, writing only when they differ', () => {
    expect(functionBody('listing_locations_sync_listing')).toMatch(/is distinct from \(p\.area, p\.full_address, p\.arrival_instructions\)/)
    expect(functionBody('listings_sync_primary_location')).toMatch(
      /is distinct from \(new\.area, new\.full_address, new\.arrival_instructions\)/,
    )
    expect(migration).toMatch(/after insert or update of area, full_address, arrival_instructions on public\.listings/)
  })

  it('sets a session location before the hold and overlap triggers, and never changes it', () => {
    expect(migration).toMatch(/create trigger sessions_aa_set_location\s+before insert or update of location_id on public\.sessions/)
    expect('sessions_aa_set_location' < 'sessions_apply_host_hold').toBe(true)
    expect('sessions_aa_set_location' < 'sessions_reject_overlap').toBe(true)
    expect(migration).toMatch(/'Pick a location for these dates\.'/)
    expect(migration).toMatch(/'A session''s location cannot change\.'/)
    expect(migration).toMatch(/revoke update \(location_id\) on table public\.sessions from public, anon, authenticated/)
  })

  it('checks overlaps per location when adding and editing dates', () => {
    expect(functionBody('reject_overlapping_session')).toMatch(/and location_id is not distinct from new\.location_id/)
    expect(functionBody('edit_open_session')).toMatch(/and location_id is not distinct from v_session\.location_id/)
    expect(functionBody('add_listing_session')).toMatch(/and location_id is not distinct from v_location/)
    expect(functionBody('add_listing_session')).toMatch(/raise exception 'That time is already on\.'/)
  })

  it('never lets one location of a multi-location listing hold another', () => {
    expect(migration).toMatch(
      /and not \(\s*l\.multi_location\s+and s\.listing_id = p_listing_id\s+and s\.location_id is distinct from p_location_id\s*\)/,
    )
    expect(functionBody('apply_host_session_hold')).toMatch(
      /host_booked_overlap\(\s*v_host, new\.id, new\.starts_at, new\.duration_mins, new\.listing_id, new\.location_id\s*\)/,
    )
    expect(migration).toMatch(
      /revoke all on function public\.host_booked_overlap\(uuid, uuid, timestamptz, integer\) from public, anon, authenticated/,
    )
  })

  it('keeps the old add_listing_session calls working', () => {
    expect(migration).toMatch(/drop function if exists public\.add_listing_session\(uuid, timestamptz, integer, uuid\);/)
    expect(migration).toMatch(/p_type_id uuid default null,\s*p_location_id uuid default null/)
    expect(migration).toMatch(
      /revoke all on function public\.add_listing_session\(uuid, timestamptz, integer, uuid, uuid\) from public, anon;\s*grant execute on function public\.add_listing_session\(uuid, timestamptz, integer, uuid, uuid\) to authenticated/,
    )
  })

  it('shows an address only to the host or someone booked at that location', () => {
    const details = functionBody('listing_location_details')
    expect(details).toMatch(/v_uid = v_host/)
    expect(details).toMatch(/where s\.location_id = loc\.id\s+and b\.status = 'confirmed'/)
    expect(details).toMatch(/public\.is_booking_companion\(b\.id, v_uid\)/)
    expect(details).toMatch(/case when a\.allowed then loc\.full_address end/)

    for (const name of ['listing_address', 'listing_arrival_instructions']) {
      const body = functionBody(name)
      expect(body).toMatch(/join public\.listing_locations loc on loc\.id = s\.location_id/)
      expect(body).toMatch(/public\.is_booking_companion\(b\.id, auth\.uid\(\)\)/)
      expect(migration).toMatch(new RegExp(`revoke all on function public\\.${name}\\(uuid\\) from public, anon;`))
      expect(migration).not.toMatch(new RegExp(`grant execute on function public\\.${name}\\(uuid\\) to anon`))
    }
  })

  it('has a rollback check covering the rules', () => {
    expect(checkSql).toMatch(/^begin;/m)
    expect(checkSql).toMatch(/^rollback;/m)
    for (const rule of [
      'a second location should need multiple locations turned on',
      'a fifth active location should be refused',
      'editing the first location should update the listing',
      'the same time at another location should be allowed',
      'an overlapping time at the same location should be refused',
      'a booking in one location must not hold another location at the same time',
      "a booking should still hold the host''s other listings at that time",
      'a guest must not see the address of a location they did not book',
      'location addresses must not be readable directly',
      'the current Create and Edit listing writes should still work as the host',
    ]) {
      expect(checkSql).toContain(rule)
    }
  })
})
