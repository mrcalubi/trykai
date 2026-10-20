import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { heldByTitleMap, heldSessionLine, isHeld, sharedBatchLine } from './sharedAvailability'

describe('shared availability copy', () => {
  it('knows a held session', () => {
    expect(isHeld({ status: 'held' })).toBe(true)
    expect(isHeld({ status: 'open' })).toBe(false)
    expect(isHeld(null)).toBe(false)
  })

  it('maps session ids to listing titles', () => {
    expect(heldByTitleMap([{ id: 'a', listings: { title: 'Latte art' } }, { id: 'b' }, null])).toEqual({
      a: 'Latte art',
      b: '',
    })
  })

  it('says what took the time', () => {
    expect(heldSessionLine('Latte art')).toBe(
      "Taken: you're booked for Latte art then. Reopens if that booking is cancelled."
    )
    expect(heldSessionLine('')).toBe("Taken: you're booked at this time. Reopens if that booking is cancelled.")
  })

  it('summarises the other listing', () => {
    expect(sharedBatchLine('Pottery', 3, 3)).toBe('Also added on Pottery.')
    expect(sharedBatchLine('Pottery', 1, 3)).toBe('Also added 1 of 3 on Pottery; the rest clash with its own sessions.')
    expect(sharedBatchLine('Pottery', 0, 3)).toBe('None added on Pottery (those times clash with its own sessions).')
  })
})

describe('00033 shared host availability', () => {
  const sql = readFileSync(
    resolve(import.meta.dirname, '../../supabase/migrations/00033_shared_host_availability.sql'),
    'utf8',
  )
  const confirm = sql.slice(sql.indexOf('create or replace function public.confirm_paid_booking'))

  it('takes the per-host lock before locking the session row', () => {
    const lock = confirm.indexOf('pg_advisory_xact_lock')
    const sessionLock = confirm.indexOf('from public.sessions\n  where id = v_booking.session_id\n  for update')
    expect(lock).toBeGreaterThan(0)
    expect(sessionLock).toBeGreaterThan(lock)
  })

  it('keeps every 00012 guard and refuses a clash as "session not open"', () => {
    for (const guard of ["'not allowed'", "'booking not found'", "'booking not pending'", "'session not found'", "'insufficient spots'"]) {
      expect(confirm).toContain(guard)
    }
    expect(confirm.match(/raise exception 'session not open'/g)).toHaveLength(2)
    expect(confirm).toContain('host_booked_overlap(v_host, v_session.id')
  })

  it('stays service-role only', () => {
    expect(sql).toContain(
      'revoke all on function public.confirm_paid_booking(uuid, text, integer, integer) from public, anon, authenticated;',
    )
    expect(sql).toContain(
      'grant execute on function public.confirm_paid_booking(uuid, text, integer, integer) to service_role;',
    )
    expect(sql).toContain('revoke all on function public.host_booked_overlap(uuid, uuid, timestamptz, integer) from public, anon, authenticated;')
  })

  it('re-checks holds on every write that can move or reopen a session', () => {
    expect(sql).toMatch(/before insert or update of starts_at, duration_mins, status on public\.sessions/)
    expect(sql).toMatch(/after update of status on public\.bookings[\s\S]*when \(old\.status = 'confirmed' and new\.status is distinct from 'confirmed'\)/)
  })
})
