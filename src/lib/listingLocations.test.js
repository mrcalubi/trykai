import { describe, expect, it, vi } from 'vitest'
import {
  datesByLocation,
  draftLocations,
  emptyLocation,
  isMissingListingLocations,
  loadLocationsForEditor,
  locationFieldHints,
  locationName,
  locationNamesById,
  locationSaveMessage,
  locationsByListing,
  LOCATIONS_NOT_SAVED_MESSAGE,
  MAX_LOCATIONS,
  queryListingLocations,
  saveListingLocations,
} from './listingLocations'

/** Records every write in order; `fail` makes the matching write return an error. */
function recordingClient({ fail = null } = {}) {
  const writes = []
  let inserted = 0
  const client = {
    from(table) {
      return {
        update(payload) {
          return {
            eq: async (column, value) => {
              writes.push({ table, op: 'update', payload, [column]: value })
              return { error: fail?.(table, 'update', payload) ?? null }
            },
          }
        },
        insert(payload) {
          return {
            select: () => ({
              single: async () => {
                writes.push({ table, op: 'insert', payload })
                const error = fail?.(table, 'insert', payload) ?? null
                if (error) return { data: null, error }
                inserted += 1
                return { data: { id: `new-${inserted}` }, error: null }
              },
            }),
          }
        },
      }
    },
  }
  return { client, writes }
}

const TAMPINES_ROW = { id: 'loc-t', listing_id: 'l1', label: '', area: 'Tampines', position: 0, is_active: true }
const JURONG_ROW = { id: 'loc-j', listing_id: 'l1', label: 'Jurong studio', area: 'Jurong East', position: 1, is_active: true }

describe('names and grouping', () => {
  it('names a location by label and area', () => {
    expect(locationName({ label: 'Jurong studio', area: 'Jurong East' })).toBe('Jurong studio · Jurong East')
    expect(locationName({ label: ' ', area: 'Tampines' })).toBe('Tampines')
    expect(locationName({ label: 'Tampines', area: 'Tampines' })).toBe('Tampines')
  })

  it('groups active locations by listing, first location first', () => {
    const grouped = locationsByListing([
      JURONG_ROW,
      TAMPINES_ROW,
      { ...JURONG_ROW, id: 'loc-old', is_active: false },
      { id: 'loc-b', listing_id: 'l2', label: null, area: 'Bedok', position: 0, is_active: true },
    ])
    expect(grouped.l1.map((place) => place.name)).toEqual(['Tampines', 'Jurong studio · Jurong East'])
    expect(grouped.l2).toHaveLength(1)
  })

  it('names sessions only for listings with several locations, removed ones too', () => {
    const names = locationNamesById([
      TAMPINES_ROW,
      JURONG_ROW,
      { ...JURONG_ROW, id: 'loc-old', label: 'Old room', is_active: false },
      { id: 'loc-b', listing_id: 'l2', label: null, area: 'Bedok', position: 0, is_active: true },
    ])
    expect(names).toEqual({
      'loc-t': 'Tampines',
      'loc-j': 'Jurong studio · Jurong East',
      'loc-old': 'Old room · Jurong East',
    })
  })

  it('counts upcoming, not cancelled, dates per location', () => {
    const now = Date.parse('2026-11-25T00:00:00Z')
    expect(
      datesByLocation(
        [
          { location_id: 'loc-t', starts_at: '2026-11-28T06:00:00Z', status: 'open' },
          { location_id: 'loc-t', starts_at: '2026-11-29T06:00:00Z', status: 'full' },
          { location_id: 'loc-j', starts_at: '2026-11-28T06:00:00Z', status: 'cancelled' },
          { location_id: 'loc-j', starts_at: '2026-11-20T06:00:00Z', status: 'open' },
        ],
        now,
      ),
    ).toEqual({ 'loc-t': 2 })
  })
})

describe('hints and drafts', () => {
  it('asks each extra location for an area and an address', () => {
    expect(
      locationFieldHints([
        emptyLocation({ area: 'Bedok', fullAddress: 'Blk 9' }),
        emptyLocation({ area: '', fullAddress: '  ' }),
      ]),
    ).toEqual({
      'location-1-area': 'Pick the area guests see for this location.',
      'location-1-fullAddress': 'Add the address for this location.',
    })
  })

  it('keeps only text in a draft, and at most 3 extra locations', () => {
    const restored = draftLocations([
      { label: 'A', area: 'Bedok', fullAddress: 'Blk 1', arrivalInstructions: 'Gate', id: 'x', extra: 1 },
      { label: 2, area: null },
      {},
      {},
      {},
    ])
    expect(restored).toHaveLength(MAX_LOCATIONS - 1)
    expect(restored[0]).toMatchObject({ id: null, label: 'A', area: 'Bedok', fullAddress: 'Blk 1', arrivalInstructions: 'Gate' })
    expect(restored[1]).toMatchObject({ label: '', area: '' })
    expect(draftLocations('nope')).toEqual([])
  })
})

describe('missing 00059', () => {
  it('recognises a missing table, column or function', () => {
    expect(isMissingListingLocations({ code: 'PGRST205', message: 'Could not find the table' })).toBe(true)
    expect(isMissingListingLocations({ code: '42703', message: 'column listings.multi_location does not exist' })).toBe(true)
    expect(
      isMissingListingLocations({
        code: 'PGRST202',
        message: 'Could not find the function public.listing_location_details(p_listing_id) in the schema cache',
      }),
    ).toBe(true)
    expect(isMissingListingLocations({ code: '42703', message: 'column listings.title does not exist' })).toBe(false)
    expect(isMissingListingLocations({ message: 'permission denied' })).toBe(false)
    expect(isMissingListingLocations(null)).toBe(false)
  })

  it('loads nothing for the editor when the listing has no multi_location column', async () => {
    const rpc = vi.fn()
    expect(await loadLocationsForEditor({ rpc }, 'l1', {})).toMatchObject({ available: false, loaded: false })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('treats a missing table as no locations, not an error', async () => {
    const query = {
      select: () => query,
      in: () => query,
      eq: () => query,
      order: async () => ({ data: null, error: { code: '42P01', message: 'relation "listing_locations" does not exist' } }),
    }
    expect(await queryListingLocations({ from: () => query }, ['l1'])).toEqual({ rows: [], available: false, error: null })
  })
})

describe('loadLocationsForEditor', () => {
  it('splits location 1 from the extras, with addresses for the host', async () => {
    const rpc = vi.fn(async () => ({
      data: [
        { ...JURONG_ROW, full_address: 'Blk 2 Jurong Street', arrival_instructions: 'Unit 5' },
        { ...TAMPINES_ROW, label: 'Home', full_address: 'Blk 1', arrival_instructions: null },
        { ...JURONG_ROW, id: 'loc-old', is_active: false, position: 2 },
      ],
      error: null,
    }))
    const result = await loadLocationsForEditor({ rpc }, 'l1', { multiLocation: true })
    expect(rpc).toHaveBeenCalledWith('listing_location_details', { p_listing_id: 'l1' })
    expect(result).toMatchObject({ available: true, loaded: true, multiLocation: true, primaryId: 'loc-t', primaryLabel: 'Home' })
    expect(result.extras).toEqual([
      expect.objectContaining({
        id: 'loc-j',
        key: 'loc-j',
        label: 'Jurong studio',
        area: 'Jurong East',
        fullAddress: 'Blk 2 Jurong Street',
        arrivalInstructions: 'Unit 5',
      }),
    ])
  })

  it('says it could not load when the read fails', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: 'timeout' } }))
    expect(await loadLocationsForEditor({ rpc }, 'l1', { multiLocation: false })).toMatchObject({
      available: true,
      loaded: false,
    })
  })
})

describe('saveListingLocations', () => {
  it('turns multiple locations on before adding one, and names location 1', async () => {
    const { client, writes } = recordingClient()
    const extra = emptyLocation({ key: 'k1', label: ' Jurong ', area: 'Jurong East', fullAddress: 'Blk 2 ', arrivalInstructions: '' })
    const { error, insertedIds } = await saveListingLocations({
      client,
      listingId: 'l1',
      multiLocation: true,
      primaryId: 'loc-t',
      primaryLabel: 'Home studio',
      extras: [extra],
    })
    expect(error).toBeNull()
    expect(insertedIds).toEqual({ k1: 'new-1' })
    expect(writes).toEqual([
      { table: 'listings', op: 'update', payload: { multi_location: true }, id: 'l1' },
      { table: 'listing_locations', op: 'update', payload: { label: 'Home studio' }, id: 'loc-t' },
      {
        table: 'listing_locations',
        op: 'insert',
        payload: {
          listing_id: 'l1',
          label: 'Jurong',
          area: 'Jurong East',
          full_address: 'Blk 2',
          arrival_instructions: null,
          position: 1,
        },
      },
    ])
  })

  it('removes the dropped locations first and turns multiple locations off last', async () => {
    const { client, writes } = recordingClient()
    await saveListingLocations({
      client,
      listingId: 'l1',
      multiLocation: false,
      savedMultiLocation: true,
      primaryId: 'loc-t',
      primaryLabel: 'Home',
      savedPrimaryLabel: 'Home',
      extras: [],
      existing: [{ id: 'loc-j' }, { id: 'loc-b' }],
    })
    expect(writes.map((write) => `${write.table}:${write.op}:${JSON.stringify(write.payload)}`)).toEqual([
      'listing_locations:update:{"is_active":false}',
      'listing_locations:update:{"is_active":false}',
      'listings:update:{"multi_location":false}',
    ])
  })

  it('updates a saved location in place and stops at the first refusal', async () => {
    const refusal = { message: "Remove this location's upcoming dates first." }
    const { client, writes } = recordingClient({
      fail: (table, op, payload) => (op === 'update' && payload.is_active === false ? refusal : null),
    })
    const { error } = await saveListingLocations({
      client,
      listingId: 'l1',
      multiLocation: true,
      savedMultiLocation: true,
      extras: [emptyLocation({ key: 'loc-b', id: 'loc-b', area: 'Bedok', fullAddress: 'Blk 9' })],
      existing: [{ id: 'loc-j' }, { id: 'loc-b' }],
    })
    expect(error).toBe(refusal)
    expect(writes).toHaveLength(1)
    expect(locationSaveMessage(error)).toBe("Remove this location's upcoming dates first.")
    expect(locationSaveMessage({ message: 'network' })).toBe(LOCATIONS_NOT_SAVED_MESSAGE)
  })

  it('keeps the ids it inserted when a later insert fails', async () => {
    let calls = 0
    const { client } = recordingClient({
      fail: (table, op) => (op === 'insert' && ++calls === 2 ? { message: 'boom' } : null),
    })
    const { error, insertedIds } = await saveListingLocations({
      client,
      listingId: 'l1',
      multiLocation: true,
      savedMultiLocation: true,
      extras: [
        emptyLocation({ key: 'a', area: 'Bedok', fullAddress: 'Blk 1' }),
        emptyLocation({ key: 'b', area: 'Bishan', fullAddress: 'Blk 2' }),
      ],
    })
    expect(error).toEqual({ message: 'boom' })
    expect(insertedIds).toEqual({ a: 'new-1' })
  })
})
