import { afterEach, describe, expect, it, vi } from 'vitest'
import { addSingaporeDays, singaporeDateKey } from './sessionBatch'
import {
  cleanSessionDraft,
  clearSessionDraft,
  isEmptySessionDraft,
  readOpenSessionForm,
  readSessionDraft,
  writeOpenSessionForm,
  writeSessionDraft,
} from './sessionFormDraft'

const ahead = (days) => addSingaporeDays(singaporeDateKey(Date.now()), days)

function draft(overrides = {}) {
  return {
    selectedDateKeys: [ahead(2), ahead(1)],
    weekdays: [6],
    everyWeeks: 1,
    forWeeks: 2,
    times: ['10:00'],
    timesByDate: {},
    perDateTimes: false,
    durationMins: '',
    alsoListingIds: [],
    ...overrides,
  }
}

describe('sessionFormDraft', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('round-trips a draft per listing, sorting dates', () => {
    writeSessionDraft('listing-1', draft())
    const back = readSessionDraft('listing-1')
    expect(back.selectedDateKeys).toEqual([ahead(1), ahead(2)])
    expect(back.times).toEqual(['10:00'])
    expect(readSessionDraft('listing-2')).toBeNull()
  })

  it('keeps per-date times only for dates still picked', () => {
    writeSessionDraft(
      'listing-1',
      draft({
        perDateTimes: true,
        selectedDateKeys: [ahead(1)],
        timesByDate: { [ahead(1)]: ['09:00', '15:00'], [ahead(3)]: ['11:00'] },
      }),
    )
    const back = readSessionDraft('listing-1')
    expect(back.perDateTimes).toBe(true)
    expect(back.timesByDate).toEqual({ [ahead(1)]: ['09:00', '15:00'] })
  })

  it('drops past dates, old drafts and empty forms', () => {
    const now = Date.now()
    const raw = { ...draft({ selectedDateKeys: [ahead(-2), ahead(1)] }), savedAt: now }
    expect(cleanSessionDraft(raw, now).selectedDateKeys).toEqual([ahead(1)])
    expect(cleanSessionDraft({ ...raw, savedAt: now - 13 * 60 * 60 * 1000 }, now)).toBeNull()
    expect(cleanSessionDraft({ savedAt: now, selectedDateKeys: [], times: [''] }, now)).toBeNull()
    expect(cleanSessionDraft(null, now)).toBeNull()
    expect(cleanSessionDraft({ ...raw, savedAt: 'yesterday' }, now)).toBeNull()
  })

  it('falls back to safe defaults for malformed fields', () => {
    const now = Date.now()
    const clean = cleanSessionDraft(
      {
        savedAt: now,
        selectedDateKeys: [ahead(1), 42],
        weekdays: ['Sat', 6],
        everyWeeks: 0,
        forWeeks: 'x',
        times: 'nope',
        timesByDate: 'nope',
        perDateTimes: 'yes',
        durationMins: 60,
        alsoListingIds: ['other', 7],
      },
      now,
    )
    expect(clean).toEqual({
      selectedDateKeys: [ahead(1)],
      weekdays: [6],
      everyWeeks: 1,
      forWeeks: 2,
      times: [''],
      timesByDate: {},
      perDateTimes: false,
      durationMins: '',
      alsoListingIds: ['other'],
    })
  })

  it('removes the stored draft when the form is emptied or cleared', () => {
    writeSessionDraft('listing-1', draft())
    writeSessionDraft('listing-1', draft({ selectedDateKeys: [], times: [''] }))
    expect(window.sessionStorage.getItem('trykai:add-sessions:listing-1')).toBeNull()

    writeSessionDraft('listing-1', draft())
    clearSessionDraft('listing-1')
    expect(readSessionDraft('listing-1')).toBeNull()
  })

  it('treats any typed time or duration as worth keeping', () => {
    expect(isEmptySessionDraft(null)).toBe(true)
    expect(isEmptySessionDraft(draft({ selectedDateKeys: [], times: ['10:00'] }))).toBe(false)
    expect(
      isEmptySessionDraft(draft({ selectedDateKeys: [], times: [''], timesByDate: { x: ['09:00'] } })),
    ).toBe(false)
    expect(isEmptySessionDraft(draft({ selectedDateKeys: [], times: [''], durationMins: '60' }))).toBe(false)
  })

  it('remembers which listing had the form open', () => {
    expect(readOpenSessionForm()).toBeNull()
    writeOpenSessionForm('listing-9')
    expect(readOpenSessionForm()).toBe('listing-9')
    writeOpenSessionForm(null)
    expect(readOpenSessionForm()).toBeNull()
  })

  it('never throws when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(readSessionDraft('listing-1')).toBeNull()
    expect(() => writeSessionDraft('listing-1', draft())).not.toThrow()
    expect(() => writeSessionDraft('listing-1', draft({ selectedDateKeys: [], times: [''] }))).not.toThrow()
    expect(() => clearSessionDraft('listing-1')).not.toThrow()
    expect(readOpenSessionForm()).toBeNull()
    expect(() => writeOpenSessionForm('x')).not.toThrow()
  })

  it('ignores calls without a listing id', () => {
    writeSessionDraft('', draft())
    expect(readSessionDraft('')).toBeNull()
    expect(() => clearSessionDraft('')).not.toThrow()
  })
})
