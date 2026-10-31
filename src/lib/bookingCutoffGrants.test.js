import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  resolve(import.meta.dirname, '../../supabase/migrations/00045_booking_cutoff_and_arrival.sql'),
  'utf8',
)

describe('00045 booking cutoff and arrival', () => {
  it('makes the cutoff public and owner-updatable without a review bounce', () => {
    expect(sql).toMatch(/add column if not exists booking_cutoff_hours smallint not null default 3/)
    expect(sql).toMatch(/check \(booking_cutoff_hours in \(3, 6, 12, 24, 48\)\)/)
    expect(sql).toMatch(/grant select \(booking_cutoff_hours\) on table public\.listings to anon, authenticated/)
    expect(sql).toMatch(/booking_cutoff_hours,/)
    expect(sql).toContain('guard_listing_review only compares')
    expect(sql).not.toMatch(/new\.booking_cutoff_hours/)
  })

  it('keeps arrival_instructions private like full_address', () => {
    expect(sql).toMatch(/add column if not exists arrival_instructions text/)
    expect(sql).toMatch(/char_length\(arrival_instructions\) <= 200/)
    expect(sql).toMatch(
      /revoke select \(arrival_instructions\) on table public\.listings from public, anon, authenticated/,
    )
    expect(sql).not.toMatch(/grant select \([^)]*arrival_instructions/)
    expect(sql).toContain('create or replace function public.listing_arrival_instructions(listing_id uuid)')
    expect(sql).toMatch(/b\.status = 'confirmed'/)
    expect(sql).toMatch(
      /revoke all on function public\.listing_arrival_instructions\(uuid\) from public, anon/,
    )
    expect(sql).toMatch(
      /grant execute on function public\.listing_arrival_instructions\(uuid\) to authenticated/,
    )
  })

  it('locks the day-of number like other PII and exposes it only through RPCs', () => {
    expect(sql).toMatch(/add column if not exists day_of_phone text/)
    expect(sql).toMatch(/add column if not exists share_day_of_phone boolean not null default false/)
    expect(sql).toContain("day_of_phone ~ '^\\+65[3689][0-9]{7}$'")
    expect(sql).toMatch(
      /revoke select \(day_of_phone, share_day_of_phone\) on table public\.users from public, anon, authenticated/,
    )
    expect(sql).not.toMatch(/grant select \([^)]*day_of_phone/)
    expect(sql).toMatch(/grant update \(day_of_phone, share_day_of_phone\) on table public\.users to authenticated/)
    expect(sql).toContain('u.day_of_phone')
    expect(sql).toContain('u.share_day_of_phone')
    expect(sql).toContain('create or replace function public.booking_host_contact(p_booking_id uuid)')
    expect(sql).toContain('b.guest_id = auth.uid()')
    expect(sql).toContain("b.status = 'confirmed'")
    expect(sql).toContain('u.share_day_of_phone is true')
    expect(sql).toContain("interval '24 hours'")
    expect(sql).toContain('starts_at + make_interval')
    expect(sql).toMatch(/revoke all on function public\.booking_host_contact\(uuid\) from public, anon/)
    expect(sql).toMatch(/grant execute on function public\.booking_host_contact\(uuid\) to authenticated/)
    expect(sql).not.toMatch(/grant execute on function public\.booking_host_contact\(uuid\) to anon/)
  })

  it('returns a host number only inside the guest day-of window', () => {
    const rpc = sql.slice(sql.indexOf('create or replace function public.booking_host_contact'))
    const body = rpc.slice(0, rpc.indexOf('create or replace function public.reschedule_booking'))
    expect(body).toContain('if auth.uid() is null then')
    expect(body).toContain('b.guest_id = auth.uid()')
    expect(body).toContain("b.status = 'confirmed'")
    expect(body).toContain('u.share_day_of_phone is true')
    expect(body).toContain('u.day_of_phone is not null')
    expect(body).toContain("now() >= s.starts_at - interval '24 hours'")
    expect(body).toContain('now() <= s.starts_at + make_interval')
    expect(body).toContain('coalesce(nullif(s.duration_mins, 0), 120)')
    expect(body).toContain('return v_phone')
    expect(body).not.toContain('grant execute on function public.booking_host_contact(uuid) to anon')
  })

  it('applies the cutoff when a guest moves a booking', () => {
    const rpc = sql.slice(sql.indexOf('create or replace function public.reschedule_booking'))
    expect(rpc).toContain('booking_cutoff_hours')
    expect(rpc).toContain("raise exception 'bookings closed'")
    expect(rpc).not.toContain('apply_host_strike')
  })
})
