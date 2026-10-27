import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('00041 profile v2', () => {
  const sql = readFileSync(
    resolve(import.meta.dirname, '../../supabase/migrations/00041_profile_v2.sql'),
    'utf8',
  )

  it('adds the five public profile columns with readable and writable grants', () => {
    for (const column of [
      'banner_preset',
      'banner_url',
      'featured_review_id',
      'instagram_handle',
      'tiktok_handle',
    ]) {
      expect(sql).toMatch(new RegExp(`add column if not exists ${column} `))
    }
    expect(sql).toMatch(
      /grant select \(banner_preset, banner_url, featured_review_id, instagram_handle, tiktok_handle\)\s+on table public\.users to anon, authenticated/,
    )
    expect(sql).toMatch(
      /grant update \(banner_preset, banner_url, featured_review_id, instagram_handle, tiktok_handle\)\s+on table public\.users to authenticated/,
    )
  })

  it('never grants the founding flag column itself', () => {
    expect(sql).not.toMatch(/grant select \([^)]*is_founding_host/)
  })

  it('limits banners to the seven presets and the owner folder in listing-photos', () => {
    expect(sql).toMatch(/banner_preset in \('coral', 'sand', 'sky', 'mint', 'lilac', 'navy', 'clay'\)/)
    expect(sql).toMatch(/'\/storage\/v1\/object\/public\/listing-photos\/' \|\| id::text \|\| '\/banner-'/)
    expect(sql).toMatch(/banner_url like 'https:\/\/%'/)
  })

  it('keeps socials to bare handles', () => {
    expect(sql).toMatch(/instagram_handle ~ '\^\[A-Za-z0-9\._\]\{1,30\}\$'/)
    expect(sql).toMatch(/tiktok_handle ~ '\^\[A-Za-z0-9\._\]\{2,24\}\$'/)
  })

  it('only lets a guest review of this user be featured', () => {
    expect(sql).toMatch(/references public\.reviews\(id\) on delete set null/)
    expect(sql).toMatch(/r\.reviewee_id = new\.id/)
    expect(sql).toMatch(/r\.role = 'guest'/)
    expect(sql).toMatch(/before update of featured_review_id on public\.users/)
  })

  it('returns only a boolean for the founding pill, to anyone', () => {
    expect(sql).toMatch(/create or replace function public\.host_is_founding\(p_host_id uuid\)\s+returns boolean/)
    expect(sql).toMatch(/grant execute on function public\.host_is_founding\(uuid\) to anon, authenticated/)
  })

  it('scopes my_profile_stats to auth.uid() and keeps it from anon', () => {
    expect(sql).toMatch(/create or replace function public\.my_profile_stats\(\)/)
    expect(sql).toMatch(/l\.host_id = auth\.uid\(\)/)
    expect(sql).toMatch(/b\.guest_id = auth\.uid\(\)/)
    expect(sql).toMatch(/where auth\.uid\(\) is not null/)
    expect(sql).toMatch(/revoke all on function public\.my_profile_stats\(\) from public, anon/)
    expect(sql).toMatch(/grant execute on function public\.my_profile_stats\(\) to authenticated/)
    expect(sql).not.toMatch(/grant execute on function public\.my_profile_stats\(\) to anon/)
  })

  it('counts only ended sessions with confirmed bookings', () => {
    const ended = sql.match(
      /s\.starts_at \+ make_interval\(mins => coalesce\(s\.duration_mins, 60\)\) < now\(\)/g,
    )
    expect(ended).toHaveLength(2)
    expect(sql.match(/b\.status = 'confirmed'/g)).toHaveLength(2)
  })

  it('is security definer with a fixed search path', () => {
    expect(sql.match(/security definer/g)).toHaveLength(2)
    expect(sql.match(/set search_path = public/g)).toHaveLength(3)
  })
})
