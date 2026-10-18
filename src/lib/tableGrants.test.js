import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  resolve(import.meta.dirname, '../../supabase/migrations/00025_tighten_table_grants.sql'),
  'utf8',
)

describe('00025 table grants', () => {
  it('gives listings SELECT of every column except full_address, INSERT and Edit columns to authenticated', () => {
    expect(migration).toMatch(/revoke all on table public\.listings from public, anon, authenticated/)
    expect(migration).toMatch(
      /grant select \(\s*id,\s*host_id,\s*title,\s*description,\s*category,\s*price_per_person,\s*max_guests,\s*duration_mins,\s*group_pricing,\s*area,\s*photo_urls,\s*whats_provided,\s*is_active,\s*created_at\s*\) on table public\.listings to anon, authenticated/,
    )
    expect(migration).not.toMatch(/grant select on table public\.listings/)
    expect(migration).not.toMatch(/grant select \([^)]*full_address/)
    expect(migration).toMatch(/grant insert on table public\.listings to authenticated/)
    expect(migration).toMatch(
      /grant update \(\s*title,\s*description,\s*category,\s*price_per_person,\s*duration_mins,\s*group_pricing,\s*area,\s*full_address,\s*whats_provided,\s*photo_urls\s*\)/,
    )
    expect(migration).not.toMatch(/grant update \([^)]*max_guests/)
    expect(migration).not.toMatch(/grant delete on table public\.listings/)
  })

  it('returns listing_address only to the host or a confirmed guest', () => {
    expect(migration).toMatch(/create or replace function public\.listing_address\(listing_id uuid\)/)
    expect(migration).toMatch(/security definer/)
    expect(migration).toMatch(/auth\.uid\(\) = v_host_id/)
    expect(migration).toMatch(/b\.status = 'confirmed'/)
    expect(migration).toMatch(/s\.listing_id = listing_address\.listing_id/)
    expect(migration).toMatch(/revoke all on function public\.listing_address\(uuid\) from public, anon/)
    expect(migration).toMatch(/grant execute on function public\.listing_address\(uuid\) to authenticated/)
    expect(migration).not.toMatch(/grant execute on function public\.listing_address\(uuid\) to anon/)
    expect(migration).toMatch(/drop function if exists public\.get_listing_address\(uuid\)/)
  })

  it('keeps reviews readable as anon and insertable as authenticated', () => {
    expect(migration).toMatch(/revoke all on table public\.reviews from public, anon, authenticated/)
    expect(migration).toMatch(/grant select on table public\.reviews to anon, authenticated/)
    expect(migration).toMatch(/grant insert on table public\.reviews to authenticated/)
    expect(migration).not.toMatch(/grant update on table public\.reviews/)
    expect(migration).not.toMatch(/grant delete on table public\.reviews/)
  })

  it('revokes truncate, trigger, and references on every public table', () => {
    for (const table of [
      'listings',
      'reviews',
      'bookings',
      'sessions',
      'users',
      'planning_areas',
      'verification_reviews',
    ]) {
      expect(migration).toMatch(
        new RegExp(
          `revoke truncate, trigger, references\\s+on table public\\.${table}\\s+from public, anon, authenticated`,
        ),
      )
    }
  })

  it('stops dumping ALL on future tables created by postgres', () => {
    expect(migration).toMatch(
      /alter default privileges for role postgres in schema public\s+revoke all on tables from anon, authenticated/,
    )
  })
})
