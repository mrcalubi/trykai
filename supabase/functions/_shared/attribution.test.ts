import { describe, expect, it } from 'vitest'
import { bookingAttribution, cleanTag, isMissingAttributionColumn } from './attribution.ts'

describe('cleanTag', () => {
  it('lower-cases, trims and turns spaces into underscores', () => {
    expect(cleanTag('  Instagram Story ')).toBe('instagram_story')
  })

  it('drops characters outside the allowed set', () => {
    expect(cleanTag('<script>x</script>')).toBe('scriptxscript')
    expect(cleanTag("day'one;--")).toBe('dayone--')
  })

  it('caps at 100 characters', () => {
    expect(cleanTag('a'.repeat(150))).toHaveLength(100)
  })

  it('returns null for non-strings and empty results', () => {
    expect(cleanTag(undefined)).toBeNull()
    expect(cleanTag(42)).toBeNull()
    expect(cleanTag('   ')).toBeNull()
    expect(cleanTag('!!!')).toBeNull()
  })
})

describe('bookingAttribution', () => {
  it('maps a full source onto the utm_ columns', () => {
    expect(bookingAttribution({ source: 'Instagram', medium: 'bio', campaign: 'DayOne' })).toEqual({
      utm_source: 'instagram',
      utm_medium: 'bio',
      utm_campaign: 'dayone',
    })
  })

  it('leaves out a missing medium or campaign', () => {
    expect(bookingAttribution({ source: 'tiktok', medium: null })).toEqual({ utm_source: 'tiktok' })
  })

  it('keeps nothing without a usable source', () => {
    expect(bookingAttribution(null)).toEqual({})
    expect(bookingAttribution('instagram')).toEqual({})
    expect(bookingAttribution({ medium: 'bio', campaign: 'x' })).toEqual({})
    expect(bookingAttribution({ source: '###' })).toEqual({})
  })
})

describe('isMissingAttributionColumn', () => {
  it('spots a missing utm_ column error', () => {
    expect(isMissingAttributionColumn('column "utm_source" of relation "bookings" does not exist')).toBe(true)
    expect(isMissingAttributionColumn("Could not find the 'utm_campaign' column")).toBe(true)
  })

  it('ignores other errors', () => {
    expect(isMissingAttributionColumn('duplicate key value')).toBe(false)
    expect(isMissingAttributionColumn(undefined)).toBe(false)
  })
})
