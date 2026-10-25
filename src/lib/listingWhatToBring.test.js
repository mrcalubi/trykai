import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  resolve(import.meta.dirname, '../../supabase/migrations/00038_listing_what_to_bring.sql'),
  'utf8',
)

describe('00038 listing what_to_bring', () => {
  it('adds the column, the item check, client grants, and the review trigger tuple', () => {
    expect(migration).toMatch(/add column if not exists what_to_bring text\[\]/)
    expect(migration).toMatch(/create or replace function public\.listings_what_to_bring_ok\(items text\[\]\)/)
    expect(migration).toMatch(/cardinality\(items\) <= 5/)
    expect(migration).toMatch(/length\(item\) < 1/)
    expect(migration).toMatch(/length\(item\) > 40/)
    expect(migration).toMatch(/item is distinct from btrim\(item\)/)
    expect(migration).toMatch(
      /add constraint listings_what_to_bring_items\s+check \(public\.listings_what_to_bring_ok\(what_to_bring\)\)/,
    )
    expect(migration).toMatch(
      /grant select \(what_to_bring\) on table public\.listings to anon, authenticated/,
    )
    expect(migration).toMatch(/grant insert on table public\.listings to authenticated/)
    expect(migration).toMatch(
      /grant update \(\s*title,\s*description,\s*category,\s*price_per_person,\s*duration_mins,\s*group_pricing,\s*area,\s*full_address,\s*whats_provided,\s*what_to_bring,\s*photo_urls\s*\)/,
    )
    expect(migration).toMatch(
      /new\.whats_provided, new\.what_to_bring, new\.area, new\.duration_mins, new\.full_address/,
    )
    expect(migration).toMatch(
      /old\.whats_provided, old\.what_to_bring, old\.area, old\.duration_mins, old\.full_address/,
    )
    expect(migration).toMatch(/create or replace function public\.guard_listing_review\(\)/)
    expect(migration).toMatch(/drop trigger if exists listings_guard_review on public\.listings/)
  })
})
