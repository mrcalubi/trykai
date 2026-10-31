import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function read(path) {
  return readFileSync(resolve(import.meta.dirname, '../..', path), 'utf8')
}

const sql = read('supabase/migrations/00044_reschedule_booking.sql')
const fn = read('supabase/functions/reschedule-booking/index.ts')
const rpc = sql.slice(sql.indexOf('create or replace function public.reschedule_booking'))

describe('00044 reschedule_booking', () => {
  it('adds the two columns with a select grant and no client write', () => {
    expect(sql).toMatch(/add column if not exists rescheduled_at timestamptz/)
    expect(sql).toMatch(
      /add column if not exists rescheduled_from_session_id uuid;/,
    )
    expect(sql).toMatch(
      /grant select \(rescheduled_at, rescheduled_from_session_id\) on table public\.bookings to authenticated/,
    )
    expect(sql).not.toMatch(/grant insert \(rescheduled_at/)
    expect(sql).not.toMatch(/grant update \(rescheduled_at/)
    expect(sql).not.toMatch(/grant insert \(rescheduled_from_session_id/)
    expect(sql).not.toMatch(/grant update \(rescheduled_from_session_id/)
  })

  it('stays service-role only with a fixed search_path', () => {
    expect(rpc).toContain('security definer')
    expect(rpc).toContain('set search_path = public')
    expect(rpc).toContain("raise exception 'not allowed'")
    expect(sql).toContain(
      'revoke all on function public.reschedule_booking(uuid, uuid) from public, anon, authenticated;',
    )
    expect(sql).toContain(
      'grant execute on function public.reschedule_booking(uuid, uuid) to service_role;',
    )
  })

  it('takes the per-host lock, then both session rows in id order', () => {
    const lock = rpc.indexOf('pg_advisory_xact_lock')
    const firstLock = rpc.indexOf('where id = v_first for update')
    const secondLock = rpc.indexOf('where id = v_second for update')
    expect(lock).toBeGreaterThan(0)
    expect(firstLock).toBeGreaterThan(lock)
    expect(secondLock).toBeGreaterThan(firstLock)
    expect(rpc).toContain('if v_booking.session_id < p_new_session_id then')
    expect(rpc).toContain("hashtextextended('trykai_host:' || v_host::text, 0)")
    expect(rpc).toContain('for update')
  })

  it('enforces every rule before moving spots', () => {
    for (const guard of [
      "'already rescheduled'",
      "'too late to reschedule'",
      "'session not available'",
      "'insufficient spots'",
      "'insufficient add-ons'",
      "'paynow window'",
    ]) {
      expect(rpc).toContain(guard)
    }
    expect(rpc).toContain("v_booking.status is distinct from 'confirmed'")
    expect(rpc).toContain('v_booking.rescheduled_at is not null')
    expect(rpc).toContain("interval '48 hours'")
    expect(rpc).toContain('v_new.listing_id is distinct from v_old.listing_id')
    expect(rpc).toContain("v_new.status is distinct from 'open'")
    expect(rpc).toContain('v_new.starts_at <= now()')
    expect(rpc).toContain('host_booked_overlap(v_host, v_new.id')
    expect(rpc).toContain('v_new.spots_remaining < v_booking.guests_count')
    expect(rpc).toContain("v_booking.payment_rail = 'paynow'")
    expect(rpc).toContain("interval '80 days'")
    expect(rpc.indexOf("raise exception 'insufficient spots'")).toBeLessThan(
      rpc.indexOf("raise exception 'insufficient add-ons'"),
    )
    expect(rpc.indexOf("raise exception 'insufficient add-ons'")).toBeLessThan(
      rpc.indexOf("raise exception 'paynow window'"),
    )
  })

  it('returns spots to the old session and takes them from the new one', () => {
    expect(rpc).toContain('spots_remaining = spots_remaining + v_booking.guests_count')
    expect(rpc).toContain("when status = 'full' then 'open'")
    expect(rpc).toContain('spots_remaining = spots_remaining - v_booking.guests_count')
    expect(rpc).toContain('when spots_remaining - v_booking.guests_count = 0 then \'full\'')
    expect(rpc).toContain('session_id = v_new.id')
    expect(rpc).toContain('rescheduled_from_session_id = v_old.id')
    expect(rpc).toContain('guest_reminder_sent_at = null')
    expect(rpc).toContain('host_reminder_sent_at = null')
    expect(rpc).not.toMatch(/total_amount\s*=/)
    expect(rpc).not.toMatch(/host_payout_amount\s*=/)
  })

  it('releases the old session holds and holds clashes for the new one', () => {
    expect(rpc).toContain('held_by_session_id = v_old.id')
    expect(rpc).toContain("and status = 'held'")
    expect(rpc).toContain('s.id <> v_new.id')
    expect(rpc).toContain("s.status = 'open'")
    expect(rpc).not.toContain('apply_host_strike')
  })
})

describe('reschedule-booking function', () => {
  it('checks the guest JWT, calls the RPC, maps errors, and emails both sides', () => {
    expect(fn).toContain('auth.getUser()')
    expect(fn).toContain('booking.guest_id !== user.id')
    expect(fn).toContain("rpc('reschedule_booking'")
    expect(fn).toContain('rescheduleErrorMessage')
    expect(fn).toContain('sendRescheduleEmails')
    expect(fn).not.toContain('apply_host_strike')
  })
})

describe('one bookings -> sessions relationship only', () => {
  // A second foreign key between bookings and sessions makes every PostgREST
  // embed of the two ambiguous (PGRST201) and broke Bookings, Hosting and the
  // webhook on staging. Keep `session_id` the only one.
  it('never adds another bookings column that references sessions', () => {
    const dir = resolve(import.meta.dirname, '../../supabase/migrations')
    const offenders = readdirSync(dir)
      .filter((name) => name.endsWith('.sql'))
      .filter((name) =>
        /alter table public\.bookings\s+add column[^;]*references public\.sessions/i.test(
          readFileSync(resolve(dir, name), 'utf8'),
        ),
      )
    expect(offenders).toEqual([])
  })

  it('00045 drops the key the first 00044 added', () => {
    const sql = read('supabase/migrations/00045_reschedule_drop_fk.sql')
    expect(sql).toMatch(
      /alter table public\.bookings\s+drop constraint if exists bookings_rescheduled_from_session_id_fkey;/,
    )
    expect(sql).toMatch(/notify pgrst, 'reload schema';/)
  })
})
