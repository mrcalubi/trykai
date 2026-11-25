import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  areasLine,
  datesByLocation,
  emptyLocation,
  isMissingListingLocations,
  listingLocationsAvailable,
  loadLocationsForEditor,
  loadRevealedPlaces,
  locationDraftFingerprint,
  locationFieldHints,
  locationName,
  locationNamesById,
  locationSaveMessage,
  locationsByListing,
  LOCATIONS_NOT_SAVED_MESSAGE,
  placeTitle,
  primaryLocationId,
  queryListingLocations,
  saveListingLocations,
  sessionsAt,
  teamNote,
} from './listingLocations'

/** A PostgREST-style query: every filter returns itself, awaiting gives `result`. */
function query(result) {
  const chain = {
    select: () => chain,
    in: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => chain,
    update: () => chain,
    insert: () => chain,
    single: () => chain,
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  }
  return chain
}

/** Answers each `from(table)` call in turn from `results` (one per write). */
function scriptedClient(results) {
  const calls = []
  return {
    calls,
    from(table) {
      calls.push(table)
      return query(results.shift() ?? { data: null, error: null })
    },
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('small helpers on empty or odd input', () => {
  it('handles missing values without throwing', () => {
    expect(locationSaveMessage(null)).toBe(LOCATIONS_NOT_SAVED_MESSAGE)
    expect(locationName(null)).toBe('')
    expect(locationName({ label: 'Rooftop' })).toBe('Rooftop')
    expect(locationsByListing(null)).toEqual({})
    expect(locationNamesById(null)).toEqual({})
    expect(datesByLocation(null)).toEqual({})
    expect(locationFieldHints(null)).toEqual({})
    expect(sessionsAt(null, null)).toEqual([])
    expect(sessionsAt(null, 'loc-1')).toEqual([])
    expect(areasLine(null)).toBe('')
    expect(areasLine([{ area: '' }])).toBe('')
    expect(placeTitle(null)).toBe('Singapore')
    expect(placeTitle({ label: 'Rooftop', area: '' })).toBe('Rooftop')
    expect(teamNote('')).toBe('Your host runs this with a team, so your teacher may be a team member.')
    expect(locationDraftFingerprint(emptyLocation({ id: undefined }))).toMatchObject({ id: null })
  })

  it('names rows with no label or area, and orders rows without a position', () => {
    const grouped = locationsByListing([
      { id: 'b', listing_id: 'l1', label: null, area: null, created_at: '2026-11-25' },
      { id: 'a', listing_id: 'l1', label: null, area: 'Bedok', created_at: '2026-11-24' },
    ])
    expect(grouped.l1.map((row) => [row.id, row.area, row.name])).toEqual([
      ['a', 'Bedok', 'Bedok'],
      ['b', '', ''],
    ])
  })

  it('makes keys even where crypto.randomUUID is missing', () => {
    vi.stubGlobal('crypto', {})
    const a = emptyLocation()
    const b = emptyLocation()
    expect(a.key).toMatch(/^location-/)
    expect(a.key).not.toBe(b.key)
  })

  it('reads a missing table or function from the message alone', () => {
    expect(isMissingListingLocations({ message: 'relation "listing_locations" does not exist' })).toBe(true)
    expect(isMissingListingLocations({ message: 'listing_locations: permission denied' })).toBe(false)
    expect(isMissingListingLocations({ code: '42P01', message: 'relation "x" does not exist' })).toBe(true)
  })
})

describe('reads that fail or return nothing', () => {
  it('loadLocationsForEditor: missing function, no rows, odd columns, thrown errors', async () => {
    const missing = { rpc: async () => ({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.listing_location_details' } }) }
    expect(await loadLocationsForEditor(missing, 'l1', { multiLocation: false })).toMatchObject({ available: false })

    const none = { rpc: async () => ({ data: null, error: null }) }
    expect(await loadLocationsForEditor(none, 'l1', { multiLocation: false })).toMatchObject({
      available: true,
      loaded: true,
      primaryId: null,
      primaryLabel: '',
      extras: [],
    })

    const odd = {
      rpc: async () => ({
        data: [
          { id: 'p', position: 0, label: null },
          { id: 'x', position: 1, label: null, area: null, full_address: 7, arrival_instructions: null },
        ],
        error: null,
      }),
    }
    const loaded = await loadLocationsForEditor(odd, 'l1', { multiLocation: true })
    expect(loaded.primaryLabel).toBe('')
    expect(loaded.extras[0]).toMatchObject({ label: '', area: '', fullAddress: '', arrivalInstructions: '' })

    const thrown = { rpc: async () => { throw new Error('offline') } }
    expect(await loadLocationsForEditor(thrown, 'l1', { multiLocation: true })).toMatchObject({
      available: true,
      loaded: false,
    })
  })

  it('listingLocationsAvailable: yes, yes on other errors, no when missing or offline', async () => {
    expect(await listingLocationsAvailable({ from: () => query({ error: null }) })).toBe(true)
    expect(await listingLocationsAvailable({ from: () => query({ error: { message: 'timeout' } }) })).toBe(true)
    expect(await listingLocationsAvailable({ from: () => query({ error: { code: '42P01', message: 'x' } }) })).toBe(false)
    expect(
      await listingLocationsAvailable({
        from: () => {
          throw new Error('offline')
        },
      }),
    ).toBe(false)
  })

  it('queryListingLocations: no ids, other errors, no data, thrown errors', async () => {
    expect(await queryListingLocations({}, null)).toEqual({ rows: [], available: true, error: null })
    const other = { message: 'timeout' }
    expect(await queryListingLocations({ from: () => query({ data: null, error: other }) }, ['l1'], { activeOnly: true })).toEqual({
      rows: [],
      available: true,
      error: other,
    })
    expect(await queryListingLocations({ from: () => query({ data: null, error: null }) }, ['l1'])).toEqual({
      rows: [],
      available: true,
      error: null,
    })
    const thrown = new Error('offline')
    const result = await queryListingLocations(
      {
        from: () => {
          throw thrown
        },
      },
      ['l1'],
    )
    expect(result).toEqual({ rows: [], available: true, error: thrown })
  })

  it('primaryLocationId: the first row, or null', async () => {
    expect(await primaryLocationId({ from: () => query({ data: [{ id: 'p' }], error: null }) }, 'l1')).toBe('p')
    expect(await primaryLocationId({ from: () => query({ data: [], error: null }) }, 'l1')).toBeNull()
    expect(await primaryLocationId({ from: () => query({ data: null, error: { message: 'x' } }) }, 'l1')).toBeNull()
  })

  it('loadRevealedPlaces: directions that are not text, and thrown errors', async () => {
    const rpc = async () => ({ data: [{ id: 'loc-t', full_address: 'Blk 1', arrival_instructions: 5 }], error: null })
    expect(await loadRevealedPlaces({ rpc }, 'l1')).toEqual({ 'loc-t': { fullAddress: 'Blk 1', arrivalInstructions: '' } })
    expect(
      await loadRevealedPlaces(
        {
          rpc: async () => {
            throw new Error('offline')
          },
        },
        'l1',
      ),
    ).toEqual({})
  })
})

describe('saveListingLocations stops at each refusal', () => {
  const refusal = { message: 'no' }
  const extra = (overrides = {}) =>
    emptyLocation({ key: 'k', area: '', fullAddress: '', arrivalInstructions: '', ...overrides })

  it('when turning multiple locations on fails', async () => {
    const client = scriptedClient([{ error: refusal }])
    expect((await saveListingLocations({ client, listingId: 'l1', multiLocation: true })).error).toBe(refusal)
    expect(client.calls).toEqual(['listings'])
  })

  it('when clearing location 1’s name fails', async () => {
    const client = scriptedClient([{ error: refusal }])
    const { error } = await saveListingLocations({
      client,
      listingId: 'l1',
      multiLocation: true,
      savedMultiLocation: true,
      primaryId: 'loc-t',
      primaryLabel: '',
      savedPrimaryLabel: 'Home',
    })
    expect(error).toBe(refusal)
  })

  it('when updating a saved location fails', async () => {
    const client = scriptedClient([{ error: refusal }])
    const { error } = await saveListingLocations({
      client,
      listingId: 'l1',
      multiLocation: true,
      savedMultiLocation: true,
      extras: [extra({ id: 'loc-j', key: 'loc-j' })],
      existing: [{ id: 'loc-j' }],
    })
    expect(error).toBe(refusal)
  })

  it('records no id when an insert returns none, and saves empty fields as null', async () => {
    const client = scriptedClient([{ data: null, error: null }])
    const { error, insertedIds } = await saveListingLocations({
      client,
      listingId: 'l1',
      multiLocation: true,
      savedMultiLocation: true,
      extras: [extra()],
    })
    expect(error).toBeNull()
    expect(insertedIds).toEqual({})
  })

  it('when turning multiple locations off fails', async () => {
    const client = scriptedClient([{ error: refusal }])
    const { error } = await saveListingLocations({
      client,
      listingId: 'l1',
      multiLocation: false,
      savedMultiLocation: true,
    })
    expect(error).toBe(refusal)
  })
})
