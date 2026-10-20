import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  browseFlag,
  hostBannerLine,
  hostInterestById,
  keenCountsById,
  keenNotifiedLine,
  toggleChoice,
} from './keen'

describe('browseFlag', () => {
  const now = new Date('2026-10-20T04:00:00Z')
  const old = { created_at: '2026-01-01T00:00:00Z', sessions: [] }
  const fresh = { created_at: '2026-10-15T00:00:00Z', sessions: [] }
  const withDate = { created_at: '2026-10-15T00:00:00Z', sessions: [{ starts_at: '2026-10-25T06:00:00Z', status: 'open' }] }

  it('shows the keen count from 2 on a listing with no dates, over New', () => {
    expect(browseFlag(fresh, 4, now)).toBe('4 keen')
    expect(browseFlag(old, 2, now)).toBe('2 keen')
  })

  it('falls back to New, then nothing', () => {
    expect(browseFlag(fresh, 1, now)).toBe('New')
    expect(browseFlag(old, 1, now)).toBeUndefined()
    expect(browseFlag(old, undefined, now)).toBeUndefined()
  })

  it('never shows keen on a listing that has dates', () => {
    expect(browseFlag(withDate, 5, now)).toBe('New')
  })
})

describe('row mapping', () => {
  it('keeps positive counts only', () => {
    expect(
      keenCountsById([
        { listing_id: 'a', keen_count: 3 },
        { listing_id: 'b', keen_count: 0 },
        { listing_id: null, keen_count: 2 },
        null,
      ]),
    ).toEqual({ a: 3 })
    expect(keenCountsById(null)).toEqual({})
  })

  it('keys host summaries by listing', () => {
    const row = { listing_id: 'a', keen_count: 2 }
    expect(hostInterestById([row, { listing_id: 'b', keen_count: 0 }])).toEqual({ a: row })
    expect(hostInterestById(undefined)).toEqual({})
  })
})

describe('copy', () => {
  it('toggles chips', () => {
    expect(toggleChoice([], 'weekend')).toEqual(['weekend'])
    expect(toggleChoice(['weekend', 'weekday'], 'weekend')).toEqual(['weekday'])
  })

  it('writes the host banner', () => {
    expect(
      hostBannerLine({ keen_count: 3, weekday: 1, weekend: 2, morning: 0, afternoon: 0, evening: 3 }),
    ).toBe('3 people are keen. When suits them: Weekends 2 · Weekdays 1, Evening 3.')
    expect(hostBannerLine({ keen_count: 1, weekday: 0, weekend: 0, morning: 0, afternoon: 0, evening: 0 })).toBe(
      '1 person is keen.',
    )
  })

  it('confirms how many guests were emailed', () => {
    expect(keenNotifiedLine(1)).toBe("We've emailed the 1 guest who was keen.")
    expect(keenNotifiedLine(4)).toBe("We've emailed the 4 guests who were keen.")
  })
})

describe('00032 listing_interests', () => {
  const sql = readFileSync(
    resolve(import.meta.dirname, '../../supabase/migrations/00032_listing_interests.sql'),
    'utf8',
  )

  it('gives clients no table access', () => {
    expect(sql).toMatch(/revoke all on table public\.listing_interests from public, anon, authenticated/)
    expect(sql).toMatch(/revoke all on table public\.listing_interest_host_notices from public, anon, authenticated/)
    expect(sql).not.toMatch(/grant (select|insert|update|delete)[^;]*listing_interests[^;]* to (anon|authenticated)/i)
  })

  it('runs every function as security definer with a fixed search path', () => {
    const functions = sql.match(/create or replace function[\s\S]*?\$\$;/g) ?? []
    expect(functions).toHaveLength(4)
    for (const fn of functions) {
      expect(fn).toMatch(/security definer/)
      expect(fn).toMatch(/set search_path = public/)
    }
  })

  it('only lets anon read counts, never rows', () => {
    const anonGrants = sql.match(/grant execute on function [^;]* to anon[^;]*;/g) ?? []
    expect(anonGrants).toEqual([
      'grant execute on function public.listing_keen_counts(uuid[]) to anon, authenticated;',
    ])
  })

  it('scopes guest and host reads to the caller', () => {
    expect(sql).toMatch(/i\.guest_id = auth\.uid\(\)/)
    expect(sql).toMatch(/guest_id = auth\.uid\(\);/)
    expect(sql).toMatch(/l\.host_id = auth\.uid\(\)/)
  })

  it('matches the choices the app offers', () => {
    expect(sql).toContain("days <@ array['weekday', 'weekend']::text[]")
    expect(sql).toContain("times <@ array['morning', 'afternoon', 'evening']::text[]")
    expect(sql).toContain('group_size between 1 and 10')
    expect(sql).toContain("interval '30 days'")
  })
})
