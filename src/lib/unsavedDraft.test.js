import { describe, expect, it } from 'vitest'
import { listingEditorDraft, settingsDraft } from './unsavedDraft'

describe('settingsDraft', () => {
  it('is equal after typing then restoring the original', () => {
    const saved = settingsDraft({ fullName: 'Mei Ling', displayName: 'Mei', bio: '' })
    const edited = settingsDraft({ fullName: 'Mei Ling', displayName: 'Latte Queen', bio: '' })
    const restored = settingsDraft({ fullName: 'Mei Ling', displayName: 'Mei', bio: '' })
    expect(edited).not.toBe(saved)
    expect(restored).toBe(saved)
  })
})

describe('listingEditorDraft', () => {
  it('changes when a photo is removed', () => {
    const photos = [
      { id: 'a', remoteUrl: 'https://cdn.test/one.jpg', file: null },
      { id: 'b', remoteUrl: 'https://cdn.test/two.jpg', file: null },
    ]
    const fields = {
      title: 'Latte art',
      description: 'Pull a rosetta.',
      category: 'Food',
      price: '45',
      maxGuests: '4',
      durationMins: '90',
      groupPricing: true,
      area: 'Bedok',
      fullAddress: '12 Coffee Road',
      whatsProvided: ['Materials'],
      whatToBring: [],
      photos,
    }
    const saved = listingEditorDraft(fields)
    const removed = listingEditorDraft({ ...fields, photos: photos.slice(1) })
    expect(removed).not.toBe(saved)
  })

  it('changes when an add-on is added', () => {
    const fields = {
      title: 'Latte art',
      description: 'Pull a rosetta.',
      category: 'Food',
      price: '45',
      maxGuests: '4',
      durationMins: '90',
      groupPricing: true,
      area: 'Bedok',
      fullAddress: '12 Coffee Road',
      whatsProvided: ['Materials'],
      whatToBring: [],
      photos: [],
      addons: [],
    }
    const saved = listingEditorDraft(fields)
    const withAddon = listingEditorDraft({
      ...fields,
      addons: [{ id: null, name: 'Kit', description: '', price: '15', unit: 'person' }],
    })
    expect(withAddon).not.toBe(saved)
  })
})
