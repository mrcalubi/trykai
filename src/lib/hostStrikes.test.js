import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  activeStrikeCount,
  HOST_STRIKE_EXPIRY_MONTHS,
  isActiveStrike,
  strikesDeactivateListings,
} from './hostStrikes'

const NOW = new Date('2026-10-25T10:00:00Z')

function monthsAgo(months) {
  const date = new Date(NOW)
  date.setUTCMonth(date.getUTCMonth() - months)
  return date.toISOString()
}

describe('active host strikes', () => {
  it('does not count a strike older than 12 months', () => {
    expect(HOST_STRIKE_EXPIRY_MONTHS).toBe(12)
    expect(
      isActiveStrike({ created_at: monthsAgo(13), removed_at: null }, NOW),
    ).toBe(false)
    expect(
      activeStrikeCount(
        [
          { created_at: monthsAgo(13), removed_at: null },
          { created_at: monthsAgo(1), removed_at: null },
        ],
        NOW,
      ),
    ).toBe(1)
  })

  it('does not count a removed strike', () => {
    expect(
      isActiveStrike(
        { created_at: monthsAgo(1), removed_at: '2026-10-20T00:00:00Z' },
        NOW,
      ),
    ).toBe(false)
    expect(
      activeStrikeCount(
        [
          { created_at: monthsAgo(1), removed_at: '2026-10-20T00:00:00Z' },
          { created_at: monthsAgo(2), removed_at: null },
        ],
        NOW,
      ),
    ).toBe(1)
  })

  it('deactivates listings at 3 active strikes', () => {
    expect(strikesDeactivateListings(2)).toBe(false)
    expect(strikesDeactivateListings(3)).toBe(true)
    expect(
      strikesDeactivateListings(
        activeStrikeCount(
          [
            { created_at: monthsAgo(1), removed_at: null },
            { created_at: monthsAgo(2), removed_at: null },
            { created_at: monthsAgo(3), removed_at: null },
          ],
          NOW,
        ),
      ),
    ).toBe(true)
  })
})

describe('00039 host_strike_events', () => {
  const sql = readFileSync(
    resolve(import.meta.dirname, '../../supabase/migrations/00039_host_strike_events.sql'),
    'utf8',
  )

  it('dates backfill at migration time so expiry does not start earlier', () => {
    expect(sql).toMatch(/Expiry runs from the migration, not earlier/)
    expect(sql).toMatch(/insert into public\.host_strike_events \(host_id, reason, created_at\)/)
    expect(sql).toMatch(/select u\.id, 'admin', now\(\)/)
  })

  it('treats a strike as active only when it is not removed and is within 12 months', () => {
    expect(sql).toMatch(/removed_at is null/)
    expect(sql).toMatch(/created_at >= now\(\) - interval '12 months'/)
  })

  it('deactivates listings when the active count is 3 or more', () => {
    expect(sql).toMatch(/if v_strikes >= 3 then/)
    expect(sql).toMatch(/set is_active = false/)
  })

  it('clears a removed strike and recomputes the counter without reactivating listings', () => {
    expect(sql).toMatch(/set removed_at = now\(\),\s+removed_note = v_note/)
    expect(sql).toMatch(/set host_strikes = v_strikes/)
    expect(sql).not.toMatch(/admin_remove_host_strike[\s\S]*is_active = true/)
  })

  it('gives anon and authenticated no table access and no execute on the strike functions', () => {
    expect(sql).toMatch(/alter table public\.host_strike_events enable row level security/)
    expect(sql).toMatch(
      /revoke all on table public\.host_strike_events from public, anon, authenticated/,
    )
    expect(sql).not.toMatch(
      /grant (select|insert|update|delete|all)[^;]*host_strike_events[^;]* to (anon|authenticated)/i,
    )
    expect(sql).toMatch(
      /revoke all on function public\.host_active_strike_count\(uuid\) from public, anon, authenticated/,
    )
    expect(sql).toMatch(
      /revoke all on function public\.apply_host_strike\(uuid, text, uuid\) from public, anon, authenticated/,
    )
    expect(sql).toMatch(
      /revoke all on function public\.admin_remove_host_strike\(uuid, text\) from public, anon, authenticated/,
    )
    expect(sql).not.toMatch(
      /grant execute on function public\.(host_active_strike_count|apply_host_strike|admin_remove_host_strike)[^;]* to (anon|authenticated)/,
    )
    expect(sql).toMatch(
      /grant execute on function public\.apply_host_strike\(uuid, text, uuid\) to service_role/,
    )
  })

  it('computes my_account strikes live and checks is_admin before a remove', () => {
    expect(sql).toMatch(/public\.host_active_strike_count\(u\.id\)/)
    expect(sql).toMatch(/where id = auth\.uid\(\) and is_admin is true/)
  })
})
