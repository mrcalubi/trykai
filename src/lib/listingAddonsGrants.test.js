import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  resolve(import.meta.dirname, '../../supabase/migrations/00042_listing_addons.sql'),
  'utf8',
)

describe('00042 listing_addons grants', () => {
  it('creates listing_addons with money, unit and length checks', () => {
    expect(migration).toMatch(/create table if not exists public\.listing_addons/)
    expect(migration).toMatch(/char_length\(btrim\(name\)\) between 1 and 60/)
    expect(migration).toMatch(/char_length\(description\) <= 140/)
    expect(migration).toMatch(/price_cents between 100 and 50000 and price_cents % 100 = 0/)
    expect(migration).toMatch(/unit in \('person', 'booking'\)/)
    expect(migration).toMatch(/session_limit between 1 and 99/)
    expect(migration).toMatch(
      /create index if not exists listing_addons_listing_id_active_idx[\s\S]*where is_active/,
    )
  })

  it('caps active add-ons at 3 and checks photo_url against the host folder', () => {
    expect(migration).toMatch(/A listing can have at most 3 add-ons/)
    expect(migration).toMatch(
      /\/storage\/v1\/object\/public\/listing-photos\/' \|\| host::text \|\| '\//,
    )
    expect(migration).toMatch(/listing_addons_set_updated_at/)
  })

  it('lets anon and authenticated read active add-ons of listings they can already read', () => {
    expect(migration).toMatch(/create policy listing_addons_select on public\.listing_addons/)
    expect(migration).toMatch(/listing_addons\.is_active or l\.host_id = auth\.uid\(\)/)
    expect(migration).toMatch(/create policy listing_addons_insert/)
    expect(migration).toMatch(/l\.host_id = auth\.uid\(\)/)
    expect(migration).toMatch(/create policy listing_addons_update/)
    expect(migration).not.toMatch(/for delete/)
  })

  it('grants columns in the 00025 style and never DELETE', () => {
    expect(migration).toMatch(
      /revoke all on table public\.listing_addons from public, anon, authenticated/,
    )
    expect(migration).toMatch(/grant all on table public\.listing_addons to service_role/)
    expect(migration).toMatch(
      /grant select \(\s*id,\s*listing_id,\s*name,\s*description,\s*price_cents,\s*unit,\s*session_limit,\s*photo_url,\s*position,\s*is_active,\s*created_at,\s*updated_at\s*\) on table public\.listing_addons to anon, authenticated/,
    )
    expect(migration).toMatch(
      /grant insert \(\s*listing_id,\s*name,\s*description,\s*price_cents,\s*unit,\s*session_limit,\s*photo_url,\s*position\s*\) on table public\.listing_addons to authenticated/,
    )
    expect(migration).toMatch(
      /grant update \(\s*name,\s*description,\s*price_cents,\s*unit,\s*session_limit,\s*photo_url,\s*position,\s*is_active\s*\) on table public\.listing_addons to authenticated/,
    )
    expect(migration).not.toMatch(/grant update \([^)]*listing_id/)
    expect(migration).not.toMatch(/grant delete on table public\.listing_addons/)
    expect(migration).toMatch(
      /revoke truncate, trigger, references\s+on table public\.listing_addons\s+from public, anon, authenticated/,
    )
  })
})
