import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const dir = resolve(import.meta.dirname, '../../supabase/migrations')
const migration = readFileSync(resolve(dir, '00051_review_reminders.sql'), 'utf8')
const check = readFileSync(resolve(import.meta.dirname, '../../supabase/tests/review_reminders_check.sql'), 'utf8')

describe('00051 review reminders', () => {
  it('is the only 00051', () => {
    expect(readdirSync(dir).filter((name) => name.startsWith('00051_'))).toHaveLength(1)
  })

  it('adds the four claim columns and stops clients writing them', () => {
    for (const column of ['review_prompt_sent_at', 'review_nudge_sent_at']) {
      expect(migration).toContain(`add column if not exists ${column} timestamptz`)
    }
    for (const column of ['host_review_prompt_sent_at', 'host_review_nudge_sent_at']) {
      expect(migration).toContain(`add column if not exists ${column} timestamptz`)
    }
    expect(migration).toMatch(/revoke update \(review_prompt_sent_at, review_nudge_sent_at\) on table public\.bookings/)
    expect(migration).toMatch(/revoke update \(host_review_prompt_sent_at, host_review_nudge_sent_at\) on table public\.sessions/)
  })

  it('is callable by the server only', () => {
    expect(migration).toMatch(
      /revoke all on function public\.claim_review_reminders\(integer\) from public, anon, authenticated;\s*grant execute on function public\.claim_review_reminders\(integer\) to service_role;/,
    )
  })

  it('claims with WHERE sent_at IS NULL so two runs cannot send twice', () => {
    expect(migration.match(/and b\.review_nudge_sent_at is null\s+returning b\.id/g)).toHaveLength(1)
    expect(migration.match(/and b\.review_prompt_sent_at is null\s+returning b\.id/g)).toHaveLength(1)
    expect(migration.match(/and s\.host_review_nudge_sent_at is null\s+returning s\.id/g)).toHaveLength(1)
    expect(migration.match(/and s\.host_review_prompt_sent_at is null\s+returning s\.id/g)).toHaveLength(1)
  })

  it('uses the 00048 review window: 2 hours to 5 days, then 5 to 7 days', () => {
    expect(migration.match(/now\(\) >= d\.s_end \+ interval '2 hours'\s+and now\(\) < d\.s_end \+ interval '5 days'/g)).toHaveLength(2)
    expect(migration.match(/now\(\) >= d\.s_end \+ interval '5 days'\s+and now\(\) < d\.s_end \+ interval '7 days'/g)).toHaveLength(2)
    expect(migration).toMatch(/coalesce\(s\.duration_mins, l\.duration_mins, 120\)/)
  })

  it('includes friends who took a seat in the host list', () => {
    expect(migration.match(/from public\.booking_guests bg/g)).toHaveLength(2)
  })

  it('ships a staging check that rolls back', () => {
    expect(check).toMatch(/^begin;$/m)
    expect(check.trim().endsWith('rollback;')).toBe(true)
  })
})
