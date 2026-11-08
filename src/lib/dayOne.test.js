import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from './supabase'
import {
  dayOneNumber,
  dayOneStatus,
  daysLeftLabel,
  daysUntil,
  launchBannerCopy,
  showsLaunchBanner,
} from './dayOne'

vi.mock('./supabase')

const ENDS = '2026-12-01T00:00:00+08:00'
const sgt = (text) => Date.parse(`${text}+08:00`)

describe('Day One helpers', () => {
  beforeEach(() => {
    supabase.rpc.mockReset()
  })

  it('counts Singapore days to launch, today included', () => {
    expect(daysUntil(ENDS, sgt('2026-11-08T12:00:00'))).toBe(23)
    expect(daysUntil(ENDS, sgt('2026-11-29T23:59:00'))).toBe(2)
    expect(daysUntil(ENDS, sgt('2026-11-30T00:01:00'))).toBe(1)
    expect(daysUntil(ENDS, sgt('2026-12-01T00:00:00'))).toBe(0)
    expect(daysUntil('not a date')).toBe(0)
    expect(daysLeftLabel(23)).toBe('23 days left')
    expect(daysLeftLabel(1)).toBe('Last day')
    expect(daysLeftLabel(0)).toBe('')
  })

  it('words the banner without an empty-looking count', () => {
    const now = sgt('2026-11-08T12:00:00')
    expect(launchBannerCopy({ spotsLeft: 47, endsAt: ENDS, now })).toEqual({
      headline: 'Soft launch: the first 50 guests get a numbered Day One badge for good.',
      friends: 'Friends you bring skip the booking fee.',
      countdown: '23 days left',
    })
    expect(launchBannerCopy({ spotsLeft: undefined, endsAt: ENDS, now }).headline).toMatch(/^Soft launch/)
    expect(launchBannerCopy({ spotsLeft: 14, endsAt: ENDS, now }).headline).toBe(
      'Only 14 Day One spots left: book before 1 Dec for a numbered badge.',
    )
    expect(launchBannerCopy({ spotsLeft: 1, endsAt: ENDS, now }).headline).toMatch(/Only 1 Day One spot left/)
    expect(launchBannerCopy({ spotsLeft: 0, endsAt: ENDS, now }).headline).toBe('All 50 Day One spots are taken.')
    expect(launchBannerCopy({ spotsLeft: 10, endsAt: ENDS, now: sgt('2026-12-01T09:00:00') })).toBeNull()
  })

  it('shows the banner on guest pages only', () => {
    expect(showsLaunchBanner('/')).toBe(true)
    expect(showsLaunchBanner('/listings/abc')).toBe(true)
    expect(showsLaunchBanner('/u/abc')).toBe(true)
    expect(showsLaunchBanner('/hosting')).toBe(false)
    expect(showsLaunchBanner('/settings')).toBe(false)
  })

  it('reads the status and numbers, and treats a missing migration as nothing', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: [{ spots_left: 31, ends_at: ENDS }], error: null })
    expect(await dayOneStatus()).toEqual({ spotsLeft: 31, endsAt: ENDS })
    expect(supabase.rpc).toHaveBeenCalledWith('day_one_status')
    supabase.rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202' } })
    expect(await dayOneStatus()).toBeNull()
    supabase.rpc.mockResolvedValueOnce({ data: [], error: null })
    expect(await dayOneStatus()).toBeNull()
    supabase.rpc.mockRejectedValueOnce(new Error('offline'))
    expect(await dayOneStatus()).toBeNull()

    supabase.rpc.mockResolvedValueOnce({ data: 12, error: null })
    expect(await dayOneNumber('user-1')).toBe(12)
    expect(supabase.rpc).toHaveBeenLastCalledWith('day_one_number', { p_user_id: 'user-1' })
    supabase.rpc.mockResolvedValueOnce({ data: null, error: null })
    expect(await dayOneNumber('user-1')).toBeNull()
    supabase.rpc.mockResolvedValueOnce({ data: null, error: { message: 'x' } })
    expect(await dayOneNumber('user-1')).toBeNull()
    supabase.rpc.mockRejectedValueOnce(new Error('offline'))
    expect(await dayOneNumber('user-1')).toBeNull()
    expect(await dayOneNumber(null)).toBeNull()
  })
})
