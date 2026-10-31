import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function read(path) {
  return readFileSync(resolve(import.meta.dirname, '../..', path), 'utf8')
}

const sql = read('supabase/migrations/00043_booking_addons.sql')
const checkout = read('supabase/functions/create-payment-intent/index.ts')
const webhook = read('supabase/functions/stripe-webhook/index.ts')
const hosting = read('src/pages/Hosting.jsx')
const confirm = sql.slice(sql.indexOf('create or replace function public.confirm_paid_booking'))

describe('00043 booking add-ons', () => {
  it('adds money columns on bookings without a client write', () => {
    expect(sql).toMatch(/add column if not exists addons_amount integer not null default 0/)
    expect(sql).toMatch(/add column if not exists addon_note text/)
    expect(sql).toMatch(/bookings_addons_amount_nonneg check \(addons_amount >= 0\)/)
    expect(sql).toMatch(/bookings_addon_note_len check \(char_length\(addon_note\) <= 120\)/)
    expect(sql).toMatch(/grant select \(addons_amount, addon_note\) on table public\.bookings to authenticated/)
    expect(sql).not.toMatch(/grant insert \(addons_amount/)
    expect(sql).not.toMatch(/grant update \(addons_amount/)
  })

  it('snapshots booking_addons for the guest or host only', () => {
    expect(sql).toMatch(/create table if not exists public\.booking_addons/)
    expect(sql).toMatch(/references public\.bookings\(id\) on delete cascade/)
    expect(sql).toMatch(/references public\.listing_addons\(id\) on delete set null/)
    expect(sql).toMatch(/unit in \('person', 'booking'\)/)
    expect(sql).toMatch(/create index if not exists booking_addons_addon_id_idx/)
    expect(sql).toMatch(/create index if not exists booking_addons_booking_id_idx/)
    expect(sql).toMatch(/enable row level security/)
    expect(sql).toMatch(/booking_addons_select_guest_or_host/)
    expect(sql).toMatch(/b\.guest_id = auth\.uid\(\) or l\.host_id = auth\.uid\(\)/)
    expect(sql).toMatch(/grant select on table public\.booking_addons to authenticated/)
    expect(sql).not.toMatch(/grant insert on table public\.booking_addons/)
    expect(sql).not.toMatch(/grant update on table public\.booking_addons/)
    expect(sql).not.toMatch(/grant delete on table public\.booking_addons/)
  })

  it('exposes remaining units for a session', () => {
    expect(sql).toMatch(/create or replace function public\.session_addon_remaining\(p_session_id uuid\)/)
    expect(sql).toMatch(/security definer/)
    expect(sql).toMatch(/set search_path = public/)
    expect(sql).toMatch(/b\.status = 'confirmed'/)
    expect(sql).toMatch(/la\.session_limit is not null/)
    expect(sql).toMatch(/grant execute on function public\.session_addon_remaining\(uuid\) to anon, authenticated/)
  })

  it('keeps confirm_paid_booking guards and refuses an add-on oversell', () => {
    for (const guard of [
      "'not allowed'",
      "'booking not found'",
      "'booking not pending'",
      "'session not found'",
      "'insufficient spots'",
      "'insufficient add-ons'",
    ]) {
      expect(confirm).toContain(guard)
    }
    expect(confirm.indexOf("raise exception 'insufficient spots'")).toBeLessThan(
      confirm.indexOf("raise exception 'insufficient add-ons'"),
    )
    expect(confirm).toContain("for update")
    expect(sql).toContain(
      'revoke all on function public.confirm_paid_booking(uuid, text, integer, integer) from public, anon, authenticated;',
    )
    expect(sql).toContain(
      'grant execute on function public.confirm_paid_booking(uuid, text, integer, integer) to service_role;',
    )
  })
})

describe('create-payment-intent add-ons', () => {
  it('loads the catalog, prices on the server, and snapshots rows', () => {
    expect(checkout).toContain("from('listing_addons')")
    expect(checkout).toContain('That add-on is no longer available. Refresh and try again.')
    expect(checkout).toContain('session_addon_remaining')
    expect(read('supabase/functions/_shared/booking.ts')).toContain('Only ${remaining}')
    expect(read('supabase/functions/_shared/booking.ts')).toContain('left for this session.')
    expect(checkout).toContain('calculateBookingCharge')
    expect(checkout).toContain('addons_amount: addonsAmount')
    expect(checkout).toContain("from('booking_addons').insert")
    expect(checkout).toContain('addonsAmount')
    expect(checkout).toMatch(/if \(snapshotError\)/)
    expect(checkout).toContain('cancelBooking')
  })
})

describe('stripe-webhook add-ons', () => {
  it('takes the host fee on the lesson only and treats add-on oversell as refund-and-tell', () => {
    expect(webhook).toContain('hostPayoutBreakdown')
    expect(webhook).toContain('addonsAmount: booking.addons_amount')
    expect(webhook).toContain("from('booking_addons')")
    expect(read('supabase/functions/_shared/booking.ts')).toContain("insufficient add-ons")
    expect(read('supabase/functions/_shared/email.ts')).toContain('Add-ons to prepare')
  })
})

describe('Hosting Prepare box', () => {
  it('renders summed add-ons and guest notes on upcoming booked sessions', () => {
    expect(hosting).toContain('hosting-prepare')
    expect(hosting).toContain('sessionPrepareBoxes')
    expect(hosting).toContain('Note from')
  })
})
