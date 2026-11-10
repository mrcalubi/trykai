import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from './supabase'
import {
  MAX_SESSION_TYPES,
  emptySessionType,
  isMissingSessionTypes,
  loadPublicSessionTypes,
  loadSessionTypesForEditor,
  publicSessionType,
  querySessionTypes,
  saveSessionTypes,
  sessionTypeDraftFingerprint,
  sessionTypeFieldHints,
  sessionTypeFromRow,
  sessionTypeNamesById,
  sessionsOfType,
  typesByListing,
} from './sessionTypes'

vi.mock('./supabase')

const ROW = {
  id: 't1',
  listing_id: 'l1',
  name: 'Hand-tied bouquet',
  description: 'Take one home.',
  photo_url: null,
  position: 0,
  is_active: true,
}
const REMOVED = { ...ROW, id: 't2', name: 'Old type', is_active: false }
const MISSING = { code: 'PGRST205', message: "Could not find the table 'public.listing_session_types'" }

describe('session type helpers', () => {
  it('knows when 00056 is missing', () => {
    expect(isMissingSessionTypes(MISSING)).toBe(true)
    expect(isMissingSessionTypes({ code: '42P01' })).toBe(true)
    expect(isMissingSessionTypes({ code: '42703', message: 'column sessions_1.type_id does not exist' })).toBe(true)
    expect(isMissingSessionTypes({ message: 'column sessions.type_id does not exist' })).toBe(true)
    expect(isMissingSessionTypes({ message: 'permission denied' })).toBe(false)
    expect(isMissingSessionTypes(null)).toBe(false)
  })

  it('maps rows for the editor and for guests', () => {
    expect(sessionTypeFromRow(ROW)).toMatchObject({ id: 't1', key: 't1', name: 'Hand-tied bouquet', photo: null })
    expect(sessionTypeFromRow({ id: 'x', photo_url: 'https://x/a.jpg' }).photo?.remoteUrl).toBe('https://x/a.jpg')
    expect(sessionTypeFromRow({ id: 'x' })).toMatchObject({ name: '', description: '' })
    expect(publicSessionType(REMOVED)).toEqual({
      id: 't2',
      name: 'Old type',
      description: 'Take one home.',
      photoUrl: null,
      isActive: false,
    })
    expect(publicSessionType({ id: 'y' })).toMatchObject({ name: '', description: '', isActive: true })
  })

  it('fingerprints drafts and hints at a missing name', () => {
    const file = { name: 'a.jpg', size: 3, lastModified: 9 }
    expect(sessionTypeDraftFingerprint(emptySessionType({ name: 'A', photo: { id: 'p', file } }))).toEqual({
      id: null,
      name: 'A',
      description: '',
      photo: { id: 'p', remoteUrl: null, file: 'a.jpg:3:9' },
    })
    expect(sessionTypeFieldHints([emptySessionType({ name: ' ' }), emptySessionType({ name: 'B' })])).toEqual({
      'type-0-name': 'Give this type a name.',
    })
    expect(sessionTypeFieldHints(null)).toEqual({})
    expect(emptySessionType().key).toBeTruthy()
  })

  it('groups active types by listing and filters sessions', () => {
    expect(typesByListing([ROW, REMOVED, { ...ROW, id: 't3', listing_id: 'l2' }])).toEqual({
      l1: [publicSessionType(ROW)],
      l2: [publicSessionType({ ...ROW, id: 't3', listing_id: 'l2' })],
    })
    expect(typesByListing(null)).toEqual({})
    const sessions = [{ id: 's1', type_id: 't1' }, { id: 's2', type_id: null }]
    expect(sessionsOfType(sessions, null)).toBe(sessions)
    expect(sessionsOfType(sessions, 't1')).toEqual([{ id: 's1', type_id: 't1' }])
    expect(sessionsOfType(null, 't1')).toEqual([])
    expect(sessionsOfType(undefined, null)).toEqual([])
    expect(MAX_SESSION_TYPES).toBe(4)
  })
})

describe('session type reads and writes', () => {
  beforeEach(() => {
    supabase.__reset()
  })

  it('reads types, active only for the editor', async () => {
    expect(await querySessionTypes(supabase, [])).toEqual({ rows: [], available: true, error: null })
    supabase.__on('listing_session_types', 'select', { data: [ROW], error: null })
    const loaded = await loadSessionTypesForEditor(supabase, 'l1')
    expect(loaded).toMatchObject({ available: true, loaded: true })
    expect(loaded.types[0].name).toBe('Hand-tied bouquet')
    expect(supabase.__lastCall('listing_session_types', 'select').filters).toContainEqual({
      method: 'eq',
      column: 'is_active',
      value: true,
    })
  })

  it('treats a missing table as no types, and other errors as not loaded', async () => {
    supabase.__once('listing_session_types', 'select', { data: null, error: MISSING })
    expect(await loadSessionTypesForEditor(supabase, 'l1')).toEqual({ types: [], available: false, loaded: true })
    supabase.__once('listing_session_types', 'select', { data: null, error: { message: 'boom' } })
    expect(await loadSessionTypesForEditor(supabase, 'l1')).toEqual({ types: [], available: true, loaded: false })
    supabase.__once('listing_session_types', 'select', () => {
      throw new Error('offline')
    })
    expect((await querySessionTypes(supabase, ['l1'])).error).toBeInstanceOf(Error)
  })

  it('gives the listing page active types and names for removed ones', async () => {
    supabase.__on('listing_session_types', 'select', { data: [ROW, REMOVED], error: null })
    const types = await loadPublicSessionTypes(supabase, 'l1')
    expect(types.active.map((type) => type.id)).toEqual(['t1'])
    expect(types.byId.t2.name).toBe('Old type')
  })

  it('looks up type names for bookings', async () => {
    expect(await sessionTypeNamesById(supabase, [null, undefined])).toEqual({})
    supabase.__once('listing_session_types', 'select', { data: [{ id: 't1', name: 'A' }], error: null })
    expect(await sessionTypeNamesById(supabase, ['t1', 't1'])).toEqual({ t1: 'A' })
    supabase.__once('listing_session_types', 'select', { data: null, error: MISSING })
    expect(await sessionTypeNamesById(supabase, ['t1'])).toEqual({})
    supabase.__once('listing_session_types', 'select', () => {
      throw new Error('offline')
    })
    expect(await sessionTypeNamesById(supabase, ['t1'])).toEqual({})
  })

  it('soft-deletes removed types, updates kept ones and inserts new ones', async () => {
    supabase.__on('listing_session_types', 'insert', { data: { id: 'new-1' }, error: null })
    const existing = [sessionTypeFromRow(ROW), sessionTypeFromRow(REMOVED)]
    const kept = { ...existing[0], name: '  Bouquet  ' }
    const added = emptySessionType({ name: 'Centrepiece', description: 'Big.' })
    const { error, insertedIds } = await saveSessionTypes({
      client: supabase,
      listingId: 'l1',
      types: [kept, added],
      existing,
      userId: 'host-1',
      storage: supabase.storage,
    })
    expect(error).toBeNull()
    expect(insertedIds).toEqual({ [added.key]: 'new-1' })
    const updates = supabase.__calls('listing_session_types', 'update')
    expect(updates[0].payload).toEqual({ is_active: false })
    expect(updates[0].filters).toContainEqual({ method: 'eq', column: 'id', value: 't2' })
    expect(updates[1].payload).toMatchObject({ name: 'Bouquet', position: 0, photo_url: null })
    expect(supabase.__lastCall('listing_session_types', 'insert').payload).toMatchObject({
      listing_id: 'l1',
      name: 'Centrepiece',
      description: 'Big.',
      position: 1,
    })
  })

  it('stops at the first failed write and reports what it inserted', async () => {
    supabase.__once('listing_session_types', 'update', { error: { message: 'no' } })
    let result = await saveSessionTypes({
      client: supabase,
      listingId: 'l1',
      types: [],
      existing: [sessionTypeFromRow(ROW)],
    })
    expect(result.error).toEqual({ message: 'no' })

    supabase.__once('listing_session_types', 'insert', { data: { id: 'n1' }, error: null })
    supabase.__once('listing_session_types', 'insert', { data: null, error: { message: 'cap' } })
    const first = emptySessionType({ name: 'A' })
    result = await saveSessionTypes({
      client: supabase,
      listingId: 'l1',
      types: [first, emptySessionType({ name: 'B' })],
    })
    expect(result).toEqual({ error: { message: 'cap' }, insertedIds: { [first.key]: 'n1' } })

    supabase.__once('listing_session_types', 'update', { error: { message: 'denied' } })
    result = await saveSessionTypes({ client: supabase, listingId: 'l1', types: [sessionTypeFromRow(ROW)] })
    expect(result.error).toEqual({ message: 'denied' })
  })

  it('keeps a saved photo url and reports an upload failure', async () => {
    supabase.__on('listing_session_types', 'update', { error: null })
    const withPhoto = sessionTypeFromRow({ ...ROW, photo_url: 'https://x/storage/a.jpg' })
    await saveSessionTypes({ client: supabase, listingId: 'l1', types: [withPhoto] })
    expect(supabase.__lastCall('listing_session_types', 'update').payload.photo_url).toBe(
      'https://x/storage/a.jpg',
    )
    const broken = emptySessionType({ name: 'A', photo: { id: 'p', file: new Blob(['x']) } })
    const result = await saveSessionTypes({
      client: supabase,
      listingId: 'l1',
      types: [broken],
      userId: 'host-1',
      storage: {
        from: () => {
          throw new Error('upload failed')
        },
      },
    })
    expect(result.error).toBeInstanceOf(Error)
  })
})
