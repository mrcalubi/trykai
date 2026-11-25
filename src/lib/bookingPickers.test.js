import { describe, expect, it } from 'vitest'
import {
  anyClassValue,
  anyPlaceValue,
  classOptions,
  classPlacesLine,
  datesMeta,
  joinWords,
  matching,
  placeFieldValue,
  placeOptions,
  placeShort,
  samePriceLine,
  upcoming,
} from './bookingPickers'

const NOW = Date.parse('2026-11-10T02:00:00Z') // Tue 10 Nov, 10 am in Singapore
const at = (hours, overrides = {}) => ({
  starts_at: new Date(NOW + hours * 3_600_000).toISOString(),
  type_id: 't1',
  location_id: 'a',
  ...overrides,
})
const PLACES = [
  { id: 'a', label: 'Thomson studio', area: 'Bishan', name: 'Thomson studio · Bishan' },
  { id: 'b', label: '', area: 'Bedok', name: 'Bedok' },
]
const CLASSES = [
  { id: 't1', name: 'Mug', photoUrl: 'https://cdn.test/mug.jpg' },
  { id: 't2', name: 'Plate' },
  { id: 't3', name: 'Bowl' },
]
const SESSIONS = [at(-2), at(48), at(50, { location_id: 'b' }), at(52, { type_id: 't2', location_id: 'b' })]

describe('bookingPickers', () => {
  it('keeps upcoming sessions, soonest first, and filters by place and class', () => {
    expect(upcoming(SESSIONS, NOW)).toHaveLength(3)
    expect(upcoming(null, NOW)).toEqual([])
    expect(matching(SESSIONS, { placeId: 'b', classId: 't2' })).toHaveLength(1)
    expect(matching(null)).toEqual([])
    expect(matching(SESSIONS)).toHaveLength(4)
  })

  it('says how many dates and when the next is', () => {
    expect(datesMeta(SESSIONS, NOW)).toBe('3 dates · next Thu 12 Nov')
    expect(datesMeta([at(-1)], NOW)).toBe('No dates yet')
  })

  it('names places and lists', () => {
    expect(joinWords([])).toBe('')
    expect(joinWords(['Bishan', 'Bishan'])).toBe('Bishan')
    expect(joinWords(['Bishan', 'Bedok', 'Tampines'])).toBe('Bishan, Bedok or Tampines')
    expect(joinWords(['Bishan', 'Bedok'], 'and')).toBe('Bishan and Bedok')
    expect(placeShort(PLACES[0])).toBe('Bishan')
    expect(placeShort({ label: 'Rooftop' })).toBe('Rooftop')
    expect(placeShort(null)).toBe('')
    expect(placeFieldValue(PLACES[0])).toBe('Thomson studio, Bishan')
    expect(placeFieldValue(PLACES[1])).toBe('Bedok')
    expect(placeFieldValue({ label: 'Bedok', area: 'bedok' })).toBe('Bedok')
    expect(placeFieldValue({ name: 'Somewhere' })).toBe('Somewhere')
    expect(anyPlaceValue(PLACES)).toBe('Any place · Bishan or Bedok')
    expect(anyPlaceValue([])).toBe('Any place')
    expect(anyClassValue(CLASSES)).toBe('Any of 3 classes')
    expect(anyClassValue([CLASSES[0]])).toBe('Any class')
  })

  it('says where a class runs on its card', () => {
    expect(classPlacesLine(SESSIONS, 't1', PLACES, NOW)).toBe('Bishan and Bedok')
    expect(classPlacesLine(SESSIONS, 't2', PLACES, NOW)).toBe('Bedok only')
    expect(classPlacesLine(SESSIONS, 't3', PLACES, NOW)).toBe('')
    expect(classPlacesLine(SESSIONS, 't1', [PLACES[0]], NOW)).toBe('Bishan')
  })

  it('says the price is the same for whatever there is to pick', () => {
    expect(samePriceLine({ places: true, classes: true })).toBe('Same price at every place and class.')
    expect(samePriceLine({ places: true })).toBe('Same price at every place.')
    expect(samePriceLine({ classes: true })).toBe('Same price for every class.')
    expect(samePriceLine()).toBe('')
  })

  it('lists places, greying those without the picked class', () => {
    expect(placeOptions({ sessions: SESSIONS, places: PLACES, now: NOW })).toEqual([
      { id: null, name: 'Any place', meta: '3 dates · next Thu 12 Nov', greyed: false },
      { id: 'a', name: 'Thomson studio', meta: 'Bishan · 1 date · next Thu 12 Nov', greyed: false },
      { id: 'b', name: 'Bedok', meta: '2 dates · next Thu 12 Nov', greyed: false },
    ])
    const withPlate = placeOptions({ sessions: SESSIONS, places: PLACES, classId: 't2', className: 'Plate', now: NOW })
    expect(withPlate[1]).toMatchObject({ greyed: true, meta: 'No Plate here' })
    expect(placeOptions({ sessions: SESSIONS, places: PLACES, classId: 't2', now: NOW })[1].meta).toBe(
      'No such class here',
    )
    expect(placeOptions({ sessions: [], places: null, now: NOW })).toHaveLength(1)
  })

  it('lists classes, greying those that run only elsewhere', () => {
    const all = classOptions({ sessions: SESSIONS, classes: CLASSES, places: PLACES, now: NOW })
    expect(all.map((option) => [option.name, option.meta, option.greyed])).toEqual([
      ['Any class', '3 dates · next Thu 12 Nov', false],
      ['Mug', '2 dates · next Thu 12 Nov', false],
      ['Plate', '1 date · next Thu 12 Nov', false],
      ['Bowl', 'No dates yet', false],
    ])
    expect(all[1].photoUrl).toBe('https://cdn.test/mug.jpg')
    const atBishan = classOptions({ sessions: SESSIONS, classes: CLASSES, places: PLACES, placeId: 'a', now: NOW })
    expect(atBishan.map((option) => [option.name, option.meta, option.greyed])).toEqual([
      ['Any class', '1 date · next Thu 12 Nov', false],
      ['Mug', '1 date · next Thu 12 Nov', false],
      ['Plate', 'Only at Bedok', true],
      ['Bowl', 'No dates yet', true],
    ])
    expect(classOptions({ sessions: [], classes: null, places: [], now: NOW })).toHaveLength(1)
  })
})
