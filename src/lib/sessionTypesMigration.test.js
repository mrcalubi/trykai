import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  resolve(import.meta.dirname, '../../supabase/migrations/00056_session_types.sql'),
  'utf8',
)
const checkSql = readFileSync(
  resolve(import.meta.dirname, '../../supabase/tests/session_types_check.sql'),
  'utf8',
)

describe('00056 session types', () => {
  it('caps types at 4 per listing and keeps photos in the host folder', () => {
    expect(migration).toMatch(/>= 4 then\s*raise exception 'A listing can have at most 4 session types\.'/)
    expect(migration).toMatch(/'\/storage\/v1\/object\/public\/listing-photos\/' \|\| v_host::text \|\| '\/'/)
    expect(migration).toMatch(/check \(char_length\(btrim\(name\)\) between 1 and 40\)/)
  })

  it('grants column-level writes only, and no client delete', () => {
    expect(migration).toMatch(/revoke all on table public\.listing_session_types from public, anon, authenticated/)
    expect(migration).toMatch(/grant insert \(listing_id, name, description, photo_url, position\)/)
    expect(migration).toMatch(/grant update \(name, description, photo_url, position, is_active\)/)
    expect(migration).not.toMatch(/grant delete/)
  })

  it('sets a session type once and checks it belongs to the listing', () => {
    expect(migration).toMatch(/revoke update \(type_id\) on table public\.sessions from public, anon, authenticated/)
    expect(migration).toMatch(/and t\.listing_id = new\.listing_id/)
    expect(migration).toMatch(/before insert or update of type_id on public\.sessions/)
  })

  it('keeps the three-argument add_listing_session call working', () => {
    expect(migration).toMatch(/drop function if exists public\.add_listing_session\(uuid, timestamptz, integer\);/)
    expect(migration).toMatch(/p_type_id uuid default null/)
    expect(migration).toMatch(/'That time already has a session of another type\.'/)
    expect(migration).toMatch(
      /revoke all on function public\.add_listing_session\(uuid, timestamptz, integer, uuid\) from public, anon;\s*grant execute on function public\.add_listing_session\(uuid, timestamptz, integer, uuid\) to authenticated/,
    )
  })

  it('has a rollback check covering the rules', () => {
    expect(checkSql).toMatch(/^begin;/m)
    expect(checkSql).toMatch(/^rollback;/m)
    for (const rule of [
      'a fifth active type should be refused',
      'a different type at the same time should be refused',
      "another listing''s type should be refused",
      "clients must not change a session''s type",
    ]) {
      expect(checkSql).toContain(rule)
    }
  })
})
