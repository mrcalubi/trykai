import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from './supabase'
import {
  ADDON_HINTS,
  MAX_LISTING_ADDONS,
  addonDraftFingerprint,
  addonEarningsLine,
  addonFieldHints,
  addonFromRow,
  addonLivePill,
  addonsHaveAnswers,
  draftAddons,
  emptyAddon,
  isMissingAddonsTable,
  loadListingAddons,
  parseAddonPriceCents,
  probeListingAddonsTable,
  saveListingAddons,
  startAddonFromIdea,
} from './listingAddons'

vi.mock('./supabase')

describe('listingAddons helpers', () => {
  it('parses whole dollars from S$1 to S$500', () => {
    expect(parseAddonPriceCents('15')).toBe(1500)
    expect(parseAddonPriceCents('1')).toBe(100)
    expect(parseAddonPriceCents('500')).toBe(50000)
    expect(parseAddonPriceCents('15.5')).toBeNull()
    expect(parseAddonPriceCents('0')).toBeNull()
    expect(parseAddonPriceCents('501')).toBeNull()
    expect(parseAddonPriceCents('')).toBeNull()
  })

  it('builds the live pill and earnings line from the first add-on', () => {
    expect(addonLivePill({ price: '15' })).toBe('You get S$15 · guests pay S$17')
    expect(addonLivePill({ price: '8' })).toBe('You get S$8 · guests pay S$9')
    expect(
      addonEarningsLine({ name: 'Take-home kit', price: '15', unit: 'person' }),
    ).toBe('If 2 guests a session pick Take-home kit, that\'s S$30 more per session for you.')
    expect(
      addonEarningsLine({ name: 'Birthday surprise', price: '20', unit: 'booking' }),
    ).toBe(
      'If 2 bookings a session add Birthday surprise, that\'s S$40 more per session for you.',
    )
  })

  it('caps idea chips at 3 and defaults occasion chips to per booking', () => {
    let addons = []
    addons = startAddonFromIdea(addons, 'Premium materials', 'person')
    addons = startAddonFromIdea(addons, 'Birthday surprise', 'booking')
    addons = startAddonFromIdea(addons, 'Take-home kit', 'person')
    expect(addons).toHaveLength(MAX_LISTING_ADDONS)
    expect(addons[1].unit).toBe('booking')
    expect(startAddonFromIdea(addons, 'Drinks and snacks', 'person')).toHaveLength(3)
  })

  it('validates name, whole-dollar price and session limit', () => {
    const hints = addonFieldHints([
      emptyAddon({ name: '  ', price: '12.5', sessionLimitEnabled: true, sessionLimit: '0' }),
    ])
    expect(hints['addon-0-name']).toBe(ADDON_HINTS.name)
    expect(hints['addon-0-price']).toBe(ADDON_HINTS.price)
    expect(hints['addon-0-limit']).toBe(ADDON_HINTS.sessionLimit)
    expect(addonFieldHints([emptyAddon({ name: 'Kit', price: '12' })])).toEqual({})
  })

  it('treats PGRST205 and 42P01 as a missing table', () => {
    expect(isMissingAddonsTable({ code: 'PGRST205' })).toBe(true)
    expect(isMissingAddonsTable({ code: '42P01' })).toBe(true)
    expect(isMissingAddonsTable({ message: 'PGRST205: missing' })).toBe(true)
    expect(isMissingAddonsTable({ code: '42501' })).toBe(false)
  })

  it('fingerprints add-ons for drafts without keeping photos as files', () => {
    const addon = emptyAddon({
      id: 'a1',
      name: 'Kit',
      price: '15',
      photo: { id: 'p', remoteUrl: 'https://cdn.test/a.jpg', file: null },
    })
    expect(addonDraftFingerprint(addon)).toMatchObject({
      id: 'a1',
      name: 'Kit',
      price: '15',
      photo: { remoteUrl: 'https://cdn.test/a.jpg', file: null },
    })
    expect(addonsHaveAnswers([{ name: 'Kit' }])).toBe(true)
    expect(addonsHaveAnswers(draftAddons(null))).toBe(false)
  })

  it('maps a saved row back into editor state', () => {
    const addon = addonFromRow({
      id: 'row-1',
      name: 'Kit',
      description: 'Nice paper',
      price_cents: 1500,
      unit: 'booking',
      session_limit: 4,
      photo_url: 'https://cdn.test/a.jpg',
    })
    expect(addon).toMatchObject({
      id: 'row-1',
      name: 'Kit',
      price: '15',
      unit: 'booking',
      sessionLimitEnabled: true,
      sessionLimit: '4',
      photo: { remoteUrl: 'https://cdn.test/a.jpg' },
    })
  })
})

describe('listingAddons load and save', () => {
  beforeEach(() => {
    supabase.__reset()
  })

  it('hides the table when PostgREST has not cached it yet', async () => {
    supabase.__on('listing_addons', 'select', {
      data: null,
      error: { code: 'PGRST205', message: "Could not find the table 'public.listing_addons'" },
    })
    expect(await probeListingAddonsTable(supabase)).toBe(false)
    const loaded = await loadListingAddons(supabase, 'listing-1')
    expect(loaded.available).toBe(false)
    expect(loaded.loaded).toBe(true)
    expect(loaded.addons).toEqual([])
  })

  it('inserts new add-ons, updates changed ones and soft-deletes removed ones', async () => {
    const existing = [
      emptyAddon({ id: 'keep', name: 'Kit', price: '10' }),
      emptyAddon({ id: 'drop', name: 'Wrap', price: '5' }),
    ]
    const addons = [
      { ...existing[0], name: 'Premium kit', price: '15' },
      emptyAddon({ name: 'Drinks', price: '8', unit: 'booking' }),
    ]

    const { error } = await saveListingAddons({
      client: supabase,
      listingId: 'listing-1',
      addons,
      existing,
      userId: 'host-9',
      storage: supabase.storage,
    })
    expect(error).toBeNull()
    const updates = supabase.__calls('listing_addons', 'update')
    expect(updates[0].payload).toEqual({ is_active: false })
    expect(updates[0].filters).toContainEqual({
      method: 'eq',
      column: 'id',
      value: 'drop',
    })
    expect(updates[1].payload).toMatchObject({
      name: 'Premium kit',
      price_cents: 1500,
    })
    expect(supabase.__lastCall('listing_addons', 'insert').payload).toMatchObject({
      listing_id: 'listing-1',
      name: 'Drinks',
      price_cents: 800,
      unit: 'booking',
      position: 1,
    })
  })
})
