import { supabase } from './supabase'

/**
 * Day One guests (00053): the first 50 people with a confirmed seat before
 * the official launch get a numbered badge for good. The database decides
 * who gets a number; these helpers only read it and word the banner.
 */

export const DAY_ONE_LIMIT = 50
/** Matches day_one_ends_at() in 00053. Used until the status read returns. */
export const DAY_ONE_ENDS_AT = '2026-12-01T00:00:00+08:00'
/** Below this the banner shows the live count; above it a count looks empty. */
export const DAY_ONE_SHOW_COUNT_BELOW = 20

/** { spotsLeft, endsAt } or null when 00053 is not applied or offline. */
export async function dayOneStatus() {
  try {
    const { data, error } = await supabase.rpc('day_one_status')
    if (error) return null
    const row = Array.isArray(data) ? data[0] : data
    if (!row || typeof row.spots_left !== 'number') return null
    return { spotsLeft: row.spots_left, endsAt: row.ends_at || DAY_ONE_ENDS_AT }
  } catch {
    return null
  }
}

/** Someone's Day One number, or null. */
export async function dayOneNumber(userId) {
  if (!userId) return null
  try {
    const { data, error } = await supabase.rpc('day_one_number', { p_user_id: userId })
    if (error) return null
    const number = Number(data)
    return Number.isInteger(number) && number > 0 ? number : null
  } catch {
    return null
  }
}

function singaporeDayKey(time) {
  return new Date(time).toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' })
}

/**
 * Whole Singapore calendar days until launch. 1 on the last day (30 Nov),
 * 0 once launch has started.
 */
export function daysUntil(endsAt, now = Date.now()) {
  const end = new Date(endsAt).getTime()
  if (Number.isNaN(end) || now >= end) return 0
  const lastDay = singaporeDayKey(end - 1)
  const today = singaporeDayKey(now)
  const ms = Date.parse(`${lastDay}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)
  return Math.round(ms / 86_400_000) + 1
}

export function daysLeftLabel(days) {
  if (days <= 0) return ''
  if (days === 1) return 'Last day'
  return `${days} days left`
}

/** Banner wording, or null when it should not show (after launch). */
export function launchBannerCopy({ spotsLeft, endsAt = DAY_ONE_ENDS_AT, now = Date.now() }) {
  const days = daysUntil(endsAt, now)
  if (days <= 0) return null
  const friends = 'Friends you bring skip the booking fee.'
  let headline
  if (typeof spotsLeft === 'number' && spotsLeft <= 0) {
    headline = `All ${DAY_ONE_LIMIT} Day One spots are taken.`
  } else if (typeof spotsLeft === 'number' && spotsLeft < DAY_ONE_SHOW_COUNT_BELOW) {
    headline = `Only ${spotsLeft} Day One ${spotsLeft === 1 ? 'spot' : 'spots'} left: book before 1 Dec for a numbered badge.`
  } else {
    headline = `Soft launch: the first ${DAY_ONE_LIMIT} guests get a numbered Day One badge for good.`
  }
  return { headline, friends, countdown: daysLeftLabel(days) }
}

/** Guest-facing pages only: browse, listings and profiles. */
export function showsLaunchBanner(pathname) {
  return pathname === '/' || pathname.startsWith('/listings/') || pathname.startsWith('/u/')
}
