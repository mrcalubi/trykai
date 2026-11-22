import { describe, expect, it } from 'vitest'
import { changedListingColumns, listingColumns, savedPhotoUrls } from './listingSaveColumns'

const loaded = {
  title: 'Stop Losing in 10 Moves',
  description: 'Chess basics.',
  category: 'Other',
  price: '36',
  durationMins: '120',
  groupPricing: true,
  area: 'Bukit Merah',
  fullAddress: '1 Board Road',
  arrivalInstructions: '',
  bookingCutoffHours: 3,
  whatsProvided: ['Equipment'],
  whatToBring: ['Notebook and pen'],
}

describe('listingColumns', () => {
  it('maps the form to listings columns', () => {
    expect(listingColumns({ ...loaded, title: ' Chess ' }, ['a.jpg'])).toMatchObject({
      title: 'Chess',
      price_per_person: 3600,
      duration_mins: 120,
      full_address: '1 Board Road',
      arrival_instructions: null,
      whats_provided: ['Equipment'],
      photo_urls: ['a.jpg'],
    })
  })

  it('does not trip over a missing description', () => {
    expect(listingColumns({ ...loaded, description: null }, []).description).toBe('')
  })
})

describe('changedListingColumns', () => {
  const before = listingColumns(loaded, ['old.jpg'])

  it('sends only the photos when only the photos changed', () => {
    expect(changedListingColumns(listingColumns(loaded, ['new.jpg']), before)).toEqual({
      photo_urls: ['new.jpg'],
    })
  })

  it('ignores whitespace the save would trim anyway', () => {
    const next = listingColumns({ ...loaded, title: `${loaded.title}  ` }, ['old.jpg'])
    expect(changedListingColumns(next, before)).toEqual({})
  })

  it('sends a changed list and a changed title', () => {
    const next = listingColumns(
      { ...loaded, title: 'Stop Losing', whatToBring: [] },
      ['old.jpg'],
    )
    expect(changedListingColumns(next, before)).toEqual({ title: 'Stop Losing', what_to_bring: [] })
  })

  it('sends everything when there is nothing to compare with', () => {
    expect(changedListingColumns(before, null)).toEqual(before)
  })
})

describe('savedPhotoUrls', () => {
  it('reads the remote URL of each saved photo', () => {
    expect(savedPhotoUrls([{ remoteUrl: 'a.jpg' }, { remoteUrl: null }, { remoteUrl: 'b.jpg' }])).toEqual([
      'a.jpg',
      'b.jpg',
    ])
  })
})
