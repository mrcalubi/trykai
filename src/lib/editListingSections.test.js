import { describe, expect, it } from 'vitest'
import {
  EDIT_SECTIONS,
  editSection,
  listingStatusLabel,
  nextDateLine,
  quickWinCount,
  sectionForHint,
  sectionSummaries,
  stepPriceDollars,
} from './editListingSections'
import { tidyAddressForDisplay } from './addressDisplay'

const base = {
  title: 'Flower arranging',
  description: 'Bouquets.',
  category: 'Arts',
  price: '33',
  maxGuests: '4',
  durationMins: '120',
  groupPricing: true,
  area: 'Ang Mo Kio',
  fullAddress: '1 Road',
  arrivalInstructions: '',
  bookingCutoffHours: 3,
  whatsProvided: ['Materials', 'Food & drinks'],
  whatToBring: ['Comfortable clothes', 'Water bottle'],
  photos: [{ id: 'p1' }],
  addons: [{ name: 'Take-home glass vase' }],
  sessionTypes: [{ name: 'Hand-tied bouquet' }, { name: 'Table centrepiece' }],
}

describe('edit listing sections', () => {
  it('knows every section and where each hint lives', () => {
    expect(EDIT_SECTIONS.map((section) => section.id)).toEqual([
      'basics',
      'price',
      'addons',
      'types',
      'notice',
      'location',
      'photos',
      'provided',
      'bring',
    ])
    expect(editSection('price').label).toBe('Price and time')
    expect(editSection('nope')).toBeNull()
    expect(sectionForHint('title')).toBe('basics')
    expect(sectionForHint('spots')).toBe('price')
    expect(sectionForHint('fullAddress')).toBe('location')
    expect(sectionForHint('addon-0-price')).toBe('addons')
    expect(sectionForHint('type-1-name')).toBe('types')
    expect(sectionForHint('anything-else')).toBe('basics')
  })

  it('sums each section up in one line, as the mockup does', () => {
    const summaries = sectionSummaries(base)
    expect(summaries.basics.text).toBe('Arts · Flower arranging')
    expect(summaries.price.text).toBe('Guests pay S$37 · 4 spots · 2 hr')
    expect(summaries.addons.text).toBe('1 add-on · Take-home glass vase')
    expect(summaries.types.text).toBe('2 types · Hand-tied bouquet, Table centrepiece')
    expect(summaries.notice.text).toBe('Guests can book until 3 hr before')
    expect(summaries.provided.text).toBe('Materials, Food & drinks')
    expect(summaries.bring.text).toBe('Comfortable clothes, Water bottle')
  })

  it('marks directions and missing photos as quick wins', () => {
    const summaries = sectionSummaries(base)
    expect(summaries.location).toEqual({
      text: 'Ang Mo Kio · add directions for guests',
      needsWork: true,
    })
    expect(summaries.photos).toEqual({ text: '1 photo · add 4 more', needsWork: true })
    expect(quickWinCount(summaries)).toBe(2)

    const done = sectionSummaries({
      ...base,
      arrivalInstructions: 'Lift B',
      photos: [1, 2, 3, 4, 5, 6].map((id) => ({ id })),
    })
    expect(done.location).toEqual({ text: 'Ang Mo Kio' })
    expect(done.photos).toEqual({ text: '6 photos' })
    expect(quickWinCount(done)).toBe(0)
  })

  it('copes with empty values', () => {
    const summaries = sectionSummaries({
      ...base,
      title: '  ',
      category: '',
      price: '',
      maxGuests: '',
      durationMins: '',
      area: '',
      whatsProvided: ['None'],
      whatToBring: [],
      addons: [],
      sessionTypes: undefined,
    })
    expect(summaries.basics.text).toBe('Add a title')
    expect(summaries.price.text).toBe('No price yet')
    expect(summaries.addons.text).toBe('None yet')
    expect(summaries.types.text).toBe('None yet')
    expect(summaries.location.text).toBe('add directions for guests')
    expect(summaries.provided.text).toBe('Nothing provided')
    expect(summaries.bring.text).toBe('Nothing to bring')
    expect(sectionSummaries({ ...base, whatsProvided: [] }).provided.text).toBe('Nothing listed yet')
    expect(sectionSummaries({ ...base, addons: [{ name: ' ' }] }).addons.text).toBe('1 add-on')
    expect(sectionSummaries({ ...base, arrivalInstructions: 'x', area: '' }).location.text).toBe(
      'Add the address',
    )
  })

  it('labels the review status', () => {
    expect(listingStatusLabel('approved')).toEqual({ label: 'Live', tone: 'live' })
    expect(listingStatusLabel('pending')).toEqual({ label: 'In review', tone: 'pending' })
    expect(listingStatusLabel('changes_requested').label).toBe('Changes requested')
    expect(listingStatusLabel(null)).toBeNull()
  })

  it('names the next date and how full it is', () => {
    const now = Date.parse('2026-11-15T00:00:00Z')
    const sessions = [
      { starts_at: '2026-11-10T02:00:00Z', bookings: [] },
      {
        starts_at: '2026-11-21T02:00:00Z',
        bookings: [
          { status: 'confirmed', guests_count: 2 },
          { status: 'cancelled', guests_count: 3 },
        ],
      },
      { starts_at: '2026-11-28T02:00:00Z', bookings: [] },
    ]
    expect(nextDateLine(sessions, '4', now)).toBe('Next: Sat, 21 Nov · 2 of 4 booked')
    expect(nextDateLine(sessions, '', now)).toBe('Next: Sat, 21 Nov')
    expect(nextDateLine([], '4', now)).toBe('')
    expect(nextDateLine(undefined, '4', now)).toBe('')
  })

  it('steps a price in whole dollars and keeps it in range', () => {
    expect(stepPriceDollars('32.93', 1)).toBe('33')
    expect(stepPriceDollars('32.93', -1)).toBe('32')
    expect(stepPriceDollars('33', 1)).toBe('34')
    expect(stepPriceDollars('1', -1)).toBe('1')
    expect(stepPriceDollars('500', 1, { max: 500 })).toBe('500')
    expect(stepPriceDollars('', 1)).toBe('1')
  })
})

describe('address display', () => {
  it('capitalises a hand-typed lowercase address only', () => {
    expect(tidyAddressForDisplay('ang mo kio ave 3')).toBe('Ang Mo Kio Ave 3')
    expect(tidyAddressForDisplay('12 CLAY ROAD SINGAPORE 470012')).toBe('12 CLAY ROAD SINGAPORE 470012')
    expect(tidyAddressForDisplay('12 Coffee Road')).toBe('12 Coffee Road')
    expect(tidyAddressForDisplay('  ')).toBe('')
    expect(tidyAddressForDisplay(null)).toBe('')
  })
})
