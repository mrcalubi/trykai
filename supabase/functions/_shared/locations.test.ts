import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  loadListingPlaceNames,
  loadSessionPlace,
  loadSessionPlaces,
  locationLine,
  placeName,
  sessionAddress,
  type SessionPlace,
} from './locations.ts'
import {
  bookingCancelledHostHtml,
  bookingConfirmedGuestHtml,
  bookingConfirmedHostHtml,
  bookingMovedGuestHtml,
  bookingMovedHostHtml,
  companionMovedHtml,
  guestSessionReminderHtml,
  hostSessionReminderHtml,
  listingSubmittedOpsHtml,
} from './email.ts'
import {
  telegramBookingMoved,
  telegramGuestCancelled,
  telegramNewBooking,
  telegramSessionReminder,
} from './telegram.ts'
import { openedDateStarts } from './interest.ts'

const jurong: SessionPlace = {
  locationId: 'loc-jurong',
  label: 'Jurong studio',
  area: 'Jurong East',
  fullAddress: 'Blk 2 Jurong Street',
  arrivalInstructions: 'Unit 5',
  multiLocation: true,
}

/** Tables answer `.select(...).in(...)` with the rows given, or an error. */
function adminWith(tables: Record<string, { data?: unknown; error?: unknown; throws?: boolean }>) {
  const calls: Array<{ table: string; columns: string; column: string; values: string[] }> = []
  const admin = {
    from: vi.fn((table: string) => ({
      select: (columns: string) => ({
        in: async (column: string, values: string[]) => {
          calls.push({ table, columns, column, values })
          const answer = tables[table] ?? { data: [] }
          if (answer.throws) throw new Error('network down')
          return { data: answer.data ?? null, error: answer.error ?? null }
        },
      }),
    })),
  }
  return { admin, calls }
}

describe('placeName and locationLine', () => {
  it('names a location by label and area, or whichever it has', () => {
    expect(placeName({ label: 'Jurong studio', area: 'Jurong East' })).toBe('Jurong studio · Jurong East')
    expect(placeName({ label: '', area: 'Tampines' })).toBe('Tampines')
    expect(placeName({ label: 'Tampines', area: 'Tampines' })).toBe('Tampines')
    expect(placeName({ label: 'Rooftop', area: '' })).toBe('Rooftop')
    expect(placeName(null)).toBe('')
  })

  it('only gives a line for a listing with several locations', () => {
    expect(locationLine(jurong)).toBe('Jurong studio · Jurong East')
    expect(locationLine({ ...jurong, multiLocation: false })).toBe('')
    expect(locationLine(null)).toBe('')
  })
})

describe('sessionAddress', () => {
  const listing = { full_address: 'Blk 1 Tampines Street', arrival_instructions: 'Level 2' }

  it("uses the session's own location", () => {
    expect(sessionAddress(jurong, listing)).toEqual({
      fullAddress: 'Blk 2 Jurong Street',
      arrivalInstructions: 'Unit 5',
    })
  })

  it("falls back to the listing's address when the location could not be read", () => {
    expect(sessionAddress(null, listing)).toEqual({
      fullAddress: 'Blk 1 Tampines Street',
      arrivalInstructions: 'Level 2',
    })
    expect(sessionAddress(null, null)).toEqual({ fullAddress: '', arrivalInstructions: '' })
  })
})

describe('loadSessionPlaces', () => {
  it('reads each session location, with whether the listing runs at several', async () => {
    const { admin, calls } = adminWith({
      sessions: {
        data: [
          { id: 's1', location_id: 'loc-jurong' },
          { id: 's2', location_id: 'loc-jurong' },
          { id: 's3', location_id: 'loc-solo' },
        ],
      },
      listing_locations: {
        data: [
          {
            id: 'loc-jurong',
            listing_id: 'l-team',
            label: 'Jurong studio',
            area: 'Jurong East',
            full_address: 'Blk 2 Jurong Street',
            arrival_instructions: 'Unit 5',
          },
          { id: 'loc-solo', listing_id: 'l-solo', label: null, area: 'Bedok', full_address: 'Blk 9', arrival_instructions: null },
        ],
      },
      listings: {
        data: [
          { id: 'l-team', multi_location: true },
          { id: 'l-solo', multi_location: false },
        ],
      },
    })
    const places = await loadSessionPlaces(admin, ['s1', 's2', 's3', 's1', null, ''])
    expect(calls[0]).toMatchObject({ table: 'sessions', column: 'id', values: ['s1', 's2', 's3'] })
    expect(calls[1]).toMatchObject({ table: 'listing_locations', column: 'id', values: ['loc-jurong', 'loc-solo'] })
    expect(calls[2]).toMatchObject({ table: 'listings', column: 'id', values: ['l-team', 'l-solo'] })
    for (const call of calls) expect(call.columns).not.toMatch(/\*|\(/)
    expect(places.get('s1')).toEqual(jurong)
    expect(places.get('s2')).toEqual(jurong)
    expect(places.get('s3')).toMatchObject({ area: 'Bedok', label: '', arrivalInstructions: '', multiLocation: false })
  })

  it("keeps the session's own address when only the listings read fails", async () => {
    const { admin } = adminWith({
      sessions: { data: [{ id: 's1', location_id: 'loc-jurong' }] },
      listing_locations: {
        data: [{ id: 'loc-jurong', listing_id: 'l-team', label: '', area: 'Jurong East', full_address: 'Blk 2 Jurong Street', arrival_instructions: '' }],
      },
      listings: { error: { message: 'timeout' } },
    })
    const place = await loadSessionPlace(admin, 's1')
    expect(place).toMatchObject({ fullAddress: 'Blk 2 Jurong Street', multiLocation: false })
    expect(locationLine(place)).toBe('')
  })

  it('returns nothing, without throwing, before 00059 or when a read fails', async () => {
    const missing = adminWith({ sessions: { error: { message: 'column sessions.location_id does not exist' } } })
    expect((await loadSessionPlaces(missing.admin, ['s1'])).size).toBe(0)

    const noTable = adminWith({
      sessions: { data: [{ id: 's1', location_id: 'loc-1' }] },
      listing_locations: { error: { message: 'relation "listing_locations" does not exist' } },
    })
    expect((await loadSessionPlaces(noTable.admin, ['s1'])).size).toBe(0)

    const down = adminWith({ sessions: { throws: true } })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await loadSessionPlaces(down.admin, ['s1'])).size).toBe(0)
  })

  it('makes no request when there is no session id', async () => {
    const { admin, calls } = adminWith({})
    expect((await loadSessionPlaces(admin, [undefined, ''])).size).toBe(0)
    expect(await loadSessionPlace(admin, null)).toBeNull()
    expect(calls).toHaveLength(0)
  })
})

describe('loadListingPlaceNames', () => {
  it('lists active locations by position, first location first', async () => {
    const { admin } = adminWith({
      listing_locations: {
        data: [
          { listing_id: 'l1', label: '', area: 'Jurong East', position: 1, created_at: '2026-11-25', is_active: true },
          { listing_id: 'l1', label: 'Home studio', area: 'Tampines', position: 0, created_at: '2026-11-20', is_active: true },
          { listing_id: 'l1', label: '', area: 'Bedok', position: 2, created_at: '2026-11-25', is_active: false },
          { listing_id: 'l2', label: '', area: 'Bishan', position: 0, created_at: '2026-11-25', is_active: true },
        ],
      },
    })
    const names = await loadListingPlaceNames(admin, ['l1', 'l2'])
    expect(names.get('l1')).toEqual(['Home studio · Tampines', 'Jurong East'])
    expect(names.get('l2')).toEqual(['Bishan'])
  })

  it('returns nothing when the table is not there yet', async () => {
    const { admin } = adminWith({ listing_locations: { error: { message: 'relation does not exist' } } })
    expect((await loadListingPlaceNames(admin, ['l1'])).size).toBe(0)
  })
})

describe('emails name the location only for a listing with several', () => {
  const guestMail = (overrides = {}) =>
    bookingConfirmedGuestHtml({
      bookingReference: 'A1B2C3D4',
      listingTitle: 'Pottery',
      hostName: 'Mei Ling',
      sessionDate: '28 Nov 2026, 2:00 pm',
      fullAddress: 'Blk 2 Jurong Street',
      guestsCount: 1,
      pricePerPersonCents: 2500,
      totalPaidCents: 2800,
      paymentMethod: 'Visa',
      sessionStartsAt: '2026-11-28T06:00:00.000Z',
      bookingId: 'booking-1',
      siteUrl: 'https://trykai.sg',
      ...overrides,
    })

  it('adds the location and the team line to the guest confirmation', () => {
    const html = guestMail({ locationName: 'Jurong studio · Jurong East', runsWithTeam: true })
    expect(html).toMatch(/>Location<\/td>\s*<td[^>]*>Jurong studio · Jurong East<\/td>/)
    expect(html).toContain('Mei Ling runs this with a team, so your teacher may be a team member.')
    expect(html).toMatch(/>Address<\/td>\s*<td[^>]*>Blk 2 Jurong Street<\/td>/)
    expect(html).toMatch(/calendar\.google\.com[^"]*Blk(\+|%20)2(\+|%20)Jurong/)
  })

  it('leaves a one-location confirmation as it was', () => {
    const html = guestMail()
    expect(html).not.toMatch(/>Location<\/td>/)
    expect(html).not.toContain('runs this with a team')
  })

  it('tells the host which location was booked', () => {
    const base = {
      bookingReference: 'A1B2C3D4',
      guestName: 'Sam',
      listingTitle: 'Pottery',
      sessionDate: '28 Nov 2026, 2:00 pm',
      guestsCount: 2,
      hostPayoutCents: 4500,
    }
    expect(bookingConfirmedHostHtml({ ...base, locationName: 'Jurong East' })).toContain(
      '<strong>Location:</strong> Jurong East',
    )
    expect(bookingConfirmedHostHtml(base)).not.toContain('Location:')
    expect(
      bookingCancelledHostHtml({ ...base, guestName: 'Sam', locationName: 'Jurong East' }),
    ).toContain('<strong>Location:</strong> Jurong East')
  })

  it('reminds the guest where, and does not promise the host is there', () => {
    const base = {
      listingTitle: 'Pottery',
      sessionDate: 'Sat 28 Nov, 2:00 pm',
      hostName: 'Mei Ling',
      bookingId: 'booking-1',
      fullAddress: 'Blk 2 Jurong Street',
    }
    const team = guestSessionReminderHtml({ ...base, locationName: 'Jurong East', runsWithTeam: true })
    expect(team).toMatch(/>Location<\/td>\s*<td[^>]*>Jurong East<\/td>/)
    expect(team).toContain("say hi when you get there. Mei Ling's team is looking forward to meeting you.")
    expect(team).not.toContain('say hi to Mei Ling')
    expect(guestSessionReminderHtml(base)).toContain('say hi to Mei Ling when you get there')

    const host = hostSessionReminderHtml({
      listingTitle: 'Pottery',
      sessionDate: 'Sat 28 Nov, 2:00 pm',
      guests: [{ name: 'Sam', guestsCount: 2 }],
      totalGuests: 2,
      locationName: 'Jurong East',
    })
    expect(host).toMatch(/>Location<\/td>\s*<td[^>]*>Jurong East<\/td>/)
  })

  it('says where a moved booking is now, with the new address only when the place changed', () => {
    const moved = bookingMovedGuestHtml({
      listingTitle: 'Pottery',
      sessionDate: '29 Nov 2026, 2:00 pm',
      bookingId: 'booking-1',
      locationName: 'Jurong East',
      fullAddress: 'Blk 2 Jurong Street',
      arrivalInstructions: 'Unit 5',
    })
    expect(moved).toContain('Pottery is now on 29 Nov 2026, 2:00 pm at Jurong East.')
    expect(moved).toMatch(/>Address<\/td>\s*<td[^>]*>Blk 2 Jurong Street<\/td>/)
    const plain = bookingMovedGuestHtml({ listingTitle: 'Pottery', sessionDate: '29 Nov', bookingId: 'b' })
    expect(plain).toContain('Pottery is now on 29 Nov.')
    expect(plain).not.toContain('>Address<')

    expect(
      bookingMovedHostHtml({
        guestFirstName: 'Sam',
        listingTitle: 'Pottery',
        oldSessionDate: '28 Nov, 2:00 pm',
        newSessionDate: '29 Nov, 2:00 pm',
        oldLocationName: 'Tampines',
        newLocationName: 'Jurong East',
      }),
    ).toContain('from 28 Nov, 2:00 pm at Tampines to 29 Nov, 2:00 pm at Jurong East.')

    expect(
      companionMovedHtml({
        bookerName: 'Sam',
        listingTitle: 'Pottery',
        newSessionDate: '29 Nov',
        bookingId: 'b',
        newLocationName: 'Jurong East',
      }),
    ).toContain('Pottery is now on 29 Nov at Jurong East.')
  })

  it('lists every location for the reviewer, and the area otherwise', () => {
    const base = {
      siteUrl: 'https://trykai.sg',
      listingId: 'l1',
      title: 'Pottery',
      description: '',
      category: 'Arts',
      area: 'Tampines',
      priceCents: 2500,
      photoCount: 3,
      hostName: 'Mei Ling',
      hostEmail: 'mei@trykai.test',
      verifiedName: null,
      verificationMethod: null,
      resubmitted: false,
    }
    const several = listingSubmittedOpsHtml({ ...base, locationNames: ['Tampines', 'Jurong <East>'] })
    expect(several).toContain('Tampines<br>Jurong &lt;East&gt;<br>Run at the same time with a team')
    expect(several).not.toMatch(/>Area<\/td>/)
    expect(listingSubmittedOpsHtml({ ...base, locationNames: ['Tampines'] })).toMatch(
      />Area<\/td>\s*<td[^>]*>Tampines<\/td>/,
    )
  })
})

describe('Telegram names the location when given', () => {
  it('puts the place after the listing title', () => {
    expect(
      telegramNewBooking({ guestName: 'Sam', listingTitle: 'Pottery', when: 'Sat 2pm', guestsCount: 2, place: 'Jurong East' }).text,
    ).toBe('New booking: Sam booked Pottery (Jurong East) for Sat 2pm (2 guests).')
    expect(telegramNewBooking({ guestName: 'Sam', listingTitle: 'Pottery', when: 'Sat 2pm', guestsCount: 1 }).text).toBe(
      'New booking: Sam booked Pottery for Sat 2pm (1 guest).',
    )
    expect(telegramGuestCancelled({ guestName: 'Sam', listingTitle: 'Pottery', when: 'Sat', place: 'Tampines' }).text).toBe(
      'Cancelled: Sam cancelled Pottery (Tampines) on Sat.',
    )
    expect(telegramBookingMoved({ guestName: 'Sam', listingTitle: 'Pottery', newWhen: 'Sun 2pm', place: 'Jurong East' }).text).toBe(
      'Moved: Sam moved Pottery to Sun 2pm at Jurong East.',
    )
    expect(
      telegramSessionReminder({ dayWord: 'Tomorrow', listingTitle: 'Pottery', time: '2:00 pm', guestsCount: 3, place: 'Jurong East' }).text,
    ).toBe('Tomorrow: 3 guests coming to Pottery (Jurong East) at 2:00 pm.')
  })
})

describe('"A date opened" lists each time once', () => {
  it('drops the same time at another location and keeps the first four', () => {
    expect(
      openedDateStarts([
        { starts_at: '2026-11-28T06:00:00Z' },
        { starts_at: '2026-11-28T06:00:00Z' },
        { starts_at: '2026-11-29T06:00:00Z' },
        { starts_at: null },
        { starts_at: '2026-11-30T06:00:00Z' },
        { starts_at: '2026-12-01T06:00:00Z' },
        { starts_at: '2026-12-02T06:00:00Z' },
      ]),
    ).toEqual(['2026-11-28T06:00:00Z', '2026-11-29T06:00:00Z', '2026-11-30T06:00:00Z', '2026-12-01T06:00:00Z'])
    expect(openedDateStarts(null)).toEqual([])
  })
})

describe('functions read the location after their main work', () => {
  const read = (name: string) => readFileSync(resolve(import.meta.dirname, `../${name}/index.ts`), 'utf8')

  it('confirms the booking before reading the location, and keeps the main read unchanged', () => {
    const source = read('stripe-webhook')
    const confirmAt = source.indexOf("admin.rpc('confirm_paid_booking'")
    const placeAt = source.indexOf('loadSessionPlace(admin, booking.session_id)')
    expect(confirmAt).toBeGreaterThan(-1)
    expect(placeAt).toBeGreaterThan(confirmAt)
    expect(source).not.toMatch(/listing_locations|location_id/)
  })

  it('moves the booking before reading either location', () => {
    const source = read('reschedule-booking')
    expect(source.indexOf('loadSessionPlaces(admin')).toBeGreaterThan(source.indexOf("admin.rpc('reschedule_booking'"))
  })

  it('reads every reminder session location in one go', () => {
    const source = read('send-reminders')
    expect(source).toContain('loadSessionPlaces(admin, sessionIds)')
    expect(source).not.toMatch(/listing_locations|location_id/)
  })
})

describe('odd rows and failures', () => {
  it('skips sessions and locations it cannot use', async () => {
    const { admin } = adminWith({
      sessions: {
        data: [
          { id: 's1', location_id: 'loc-a' },
          { id: 's2', location_id: null },
          { id: 's3', location_id: 'loc-gone' },
          { location_id: 'loc-a' },
        ],
      },
      listing_locations: {
        data: [{ id: 'loc-a', listing_id: null, label: null, area: 'Bedok' }, { label: 'no id' }],
      },
    })
    const places = await loadSessionPlaces(admin, ['s1', 's2', 's3'])
    expect([...places.keys()]).toEqual(['s1'])
    expect(places.get('s1')).toMatchObject({ area: 'Bedok', multiLocation: false })
  })

  it('reads nothing more when no session has a location', async () => {
    const { admin, calls } = adminWith({ sessions: { data: [{ id: 's1', location_id: null }] } })
    expect((await loadSessionPlaces(admin, ['s1'])).size).toBe(0)
    expect(calls).toHaveLength(1)
  })

  it('leaves out rows without a name, inactive or listing-less ones, and orders by position then date', async () => {
    const { admin } = adminWith({
      listing_locations: {
        data: [
          { listing_id: 'l1', label: '', area: '', position: 0, is_active: true },
          { listing_id: null, label: '', area: 'Bedok', position: 0, is_active: true },
          { listing_id: 'l1', label: '', area: 'Bishan', created_at: '2026-11-26', is_active: true },
          { listing_id: 'l1', label: '', area: 'Bedok', created_at: '2026-11-25', is_active: true },
        ],
      },
    })
    expect((await loadListingPlaceNames(admin, ['l1'])).get('l1')).toEqual(['Bedok', 'Bishan'])
    expect((await loadListingPlaceNames(admin, [])).size).toBe(0)
  })

  it('returns nothing when the listing names read throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { admin } = adminWith({ listing_locations: { throws: true } })
    expect((await loadListingPlaceNames(admin, ['l1'])).size).toBe(0)
  })
})
