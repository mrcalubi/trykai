import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  resolve(import.meta.dirname, '../../supabase/migrations/00048_two_way_reviews.sql'),
  'utf8',
)
const lock = readFileSync(
  resolve(import.meta.dirname, '../../supabase/migrations/00049_lock_reviews.sql'),
  'utf8',
)
const checkSql = readFileSync(
  resolve(import.meta.dirname, '../../supabase/tests/two_way_reviews_check.sql'),
  'utf8',
)
const grants14 = readFileSync(
  resolve(import.meta.dirname, '../../supabase/migrations/00014_display_name.sql'),
  'utf8',
)
const grants15 = readFileSync(
  resolve(import.meta.dirname, '../../supabase/migrations/00015_listing_ratings_and_delete_listing.sql'),
  'utf8',
)
const grants41 = readFileSync(
  resolve(import.meta.dirname, '../../supabase/migrations/00041_profile_v2.sql'),
  'utf8',
)

const HOST_GRANT =
  /revoke all on function public\.reviews_for_host\(uuid\) from public;\s*grant execute on function public\.reviews_for_host\(uuid\) to anon, authenticated/
const LISTING_GRANT =
  /revoke all on function public\.reviews_for_listing\(uuid\) from public;\s*grant execute on function public\.reviews_for_listing\(uuid\) to anon, authenticated/
const RATINGS_GRANT =
  /revoke all on function public\.listing_ratings\(uuid\[]\) from public;\s*grant execute on function public\.listing_ratings\(uuid\[]\) to anon, authenticated/
const STATS_GRANT =
  /revoke all on function public\.my_profile_stats\(\) from public, anon;\s*grant execute on function public\.my_profile_stats\(\) to authenticated/

describe('00048 two-way reviews', () => {
  it('adds reveal columns and backfills only rows that never had reveal_after', () => {
    expect(migration).toMatch(/add column if not exists reveal_after timestamptz/)
    expect(migration).toMatch(/add column if not exists revealed_at timestamptz/)
    expect(migration).toMatch(/add column if not exists other_party_emailed_at timestamptz/)
    expect(migration).toMatch(/where reveal_after is null/)
    expect(migration).not.toMatch(/where revealed_at is null/)
  })

  it('defines review_is_public once and uses it on every reader', () => {
    expect(migration).toMatch(
      /create or replace function public\.review_is_public\(r public\.reviews\)/,
    )
    expect(migration).toMatch(/r\.revealed_at is not null or now\(\) >= r\.reveal_after/)
    expect(migration.match(/public\.review_is_public\(r\)/g).length).toBeGreaterThan(6)
  })

  it('replaces the role unique constraint with one guest review per booking and one host review per person', () => {
    expect(migration).toMatch(/drop constraint if exists reviews_booking_id_role_key/)
    expect(migration).toMatch(
      /create unique index reviews_one_guest_per_booking\s+on public\.reviews \(booking_id\)\s+where role = 'guest'/,
    )
    expect(migration).toMatch(
      /create unique index reviews_one_host_per_guest_per_booking\s+on public\.reviews \(booking_id, reviewee_id\)\s+where role = 'host'/,
    )
  })

  it('sets reveal_after from the session end plus 7 days and ignores client reveal columns', () => {
    expect(migration).toMatch(/new\.revealed_at := null/)
    expect(migration).toMatch(/new\.other_party_emailed_at := null/)
    expect(migration).toMatch(/new\.reveal_after := v_session_end/)
    expect(migration).toMatch(/interval '7 days'/)
    expect(migration).toMatch(/before insert on public\.reviews/)
  })

  it('reveals both sides under a booking row lock', () => {
    expect(migration).toMatch(/from public\.bookings where id = new\.booking_id for update/)
    expect(migration).toMatch(/after insert on public\.reviews/)
    expect(migration).toMatch(/set revealed_at = now\(\)/)
  })

  it('keeps review_notes off the client and grants only service_role select and update', () => {
    expect(migration).toMatch(/create table if not exists public\.review_notes/)
    expect(migration).toMatch(/char_length\(note\) between 1 and 2000/)
    expect(migration).toMatch(/enable row level security/)
    expect(migration).toMatch(/revoke all on table public\.review_notes from public, anon, authenticated/)
    expect(migration).toMatch(/grant select, update on table public\.review_notes to service_role/)
    expect(migration).not.toMatch(/create policy[\s\S]*review_notes/)
  })

  it('derives post_review role from auth.uid and restores reader grants byte-for-byte', () => {
    expect(migration).toMatch(/create or replace function public\.post_review/)
    expect(migration).toMatch(/security definer/)
    expect(migration).toMatch(/set search_path = public/)
    expect(migration).toMatch(/revoke all on function public\.post_review[\s\S]*from public, anon/)
    expect(migration).toMatch(/grant execute on function public\.post_review[\s\S]*to authenticated/)
    expect(migration).toMatch(/raise exception 'already_reviewed'/)
    expect(migration).toMatch(/raise exception 'review_window_closed'/)
    expect(migration).toMatch(/raise exception 'not_allowed'/)
    const guestReturns = migration.match(
      /create or replace function public\.reviews_for_guest\(p_guest_id uuid\)\s*returns table \(([\s\S]*?)\)\s*language/,
    )[1]
    expect(guestReturns).toMatch(/host_avatar_url text/)
    expect(guestReturns).not.toMatch(/rating/)
    expect(grants14).toMatch(HOST_GRANT)
    expect(grants14).toMatch(LISTING_GRANT)
    expect(migration.match(HOST_GRANT)[0]).toBe(grants14.match(HOST_GRANT)[0])
    expect(migration.match(LISTING_GRANT)[0]).toBe(grants14.match(LISTING_GRANT)[0])
    expect(grants15).toMatch(RATINGS_GRANT)
    expect(migration.match(RATINGS_GRANT)[0]).toBe(grants15.match(RATINGS_GRANT)[0])
    expect(grants41).toMatch(STATS_GRANT)
    expect(migration.match(STATS_GRANT)[0]).toBe(grants41.match(STATS_GRANT)[0])
    expect(migration).not.toMatch(/revoke select on table public\.reviews/)
    expect(migration).not.toMatch(/revoke insert on table public\.reviews/)
  })

  it('adds host_rating, reviews_for_guest, my_review_state, host_reviews_due and extra my_profile_stats columns', () => {
    expect(migration).toMatch(/create or replace function public\.host_rating\(p_host_id uuid\)/)
    expect(migration).toMatch(/create or replace function public\.reviews_for_guest\(p_guest_id uuid\)/)
    expect(migration).toMatch(/create or replace function public\.my_review_state\(p_booking_id uuid\)/)
    expect(migration).toMatch(/create or replace function public\.host_reviews_due\(\)/)
    expect(migration).toMatch(/host_reviews_received integer/)
    expect(migration).toMatch(/host_five_star_received integer/)
    expect(migration).toMatch(/guests_reviewed integer/)
    expect(migration).toMatch(/and public\.review_is_public\(r\)/)
  })
})

describe('00049 lock reviews', () => {
  it('is labelled as post-release and drops public read and guest insert', () => {
    expect(lock).toMatch(/Apply this file ONLY after the two-way-reviews release is live/)
    expect(lock).toMatch(/drop policy if exists "Anyone can view reviews"/)
    expect(lock).toMatch(/drop policy if exists "Guests can leave reviews"/)
    expect(lock).toMatch(/revoke select, insert on table public\.reviews from anon/)
    expect(lock).toMatch(/revoke insert on table public\.reviews from authenticated/)
    expect(lock).toMatch(/Reviewers can read their own reviews/)
    expect(lock).toMatch(/reviewer_id = auth\.uid\(\)/)
  })
})

describe('two_way_reviews_check.sql', () => {
  it('is a begin/rollback script that acts as guest, host and anon', () => {
    expect(checkSql).toMatch(/^begin;/m)
    expect(checkSql).toMatch(/^rollback;/m)
    expect(checkSql).toMatch(/set local role authenticated/)
    expect(checkSql).toMatch(/request\.jwt\.claims/)
    expect(checkSql).toMatch(/already_reviewed/)
    expect(checkSql).toMatch(/review_window_closed/)
    expect(checkSql).toMatch(/not_allowed/)
    expect(checkSql).toMatch(/reviews_for_guest must never return rating/)
    expect(checkSql).toMatch(/anon should not select reviews after 00049/)
  })
  it('runs the featured-review guard as definer so 00049 cannot break it', () => {
    expect(migration).toMatch(
      /create or replace function public\.guard_featured_review\(\)\s*returns trigger\s*language plpgsql\s*security definer/,
    )
  })

  it('gives a stranger no review state for someone else\'s booking', () => {
    const body = migration.slice(migration.indexOf('function public.my_review_state'))
    expect(body).toMatch(/Not the guest or the host: return nothing/)
    expect(body.slice(0, body.indexOf('$$;'))).not.toMatch(/can_review := false;/)
  })
})
