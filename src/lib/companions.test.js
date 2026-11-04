import { describe, expect, it } from 'vitest'
import {
  claimErrorState,
  companionBookingsFromRpc,
  companionSeats,
  groupGuestsBySession,
  joinStateMessage,
  joinUrl,
  seatsLabel,
  sessionGuestsLine,
} from './companions'

describe('companions helpers', () => {
  it('counts seats a booker can hand out', () => {
    expect(companionSeats(1)).toBe(0)
    expect(companionSeats(3)).toBe(2)
    expect(companionSeats(undefined)).toBe(0)
    expect(companionSeats('2')).toBe(1)
  })

  it('labels seats as booker plus friends out of the group', () => {
    expect(seatsLabel(3, 1)).toBe('2 of 3 seats')
    expect(seatsLabel(3, 0)).toBe('1 of 3 seats')
    expect(seatsLabel(2, 5)).toBe('2 of 2 seats')
  })

  it('builds the join link from the origin', () => {
    expect(joinUrl('abc123', 'https://trykai.sg')).toBe('https://trykai.sg/join/abc123')
  })

  it('maps every claim state to one short line', () => {
    expect(joinStateMessage('full', 'Kai')).toBe('All seats are taken. Ask Kai if you think this is a mistake.')
    expect(joinStateMessage('full')).toMatch(/the person who booked/)
    expect(joinStateMessage('cancelled')).toBe('This booking was cancelled.')
    expect(joinStateMessage('closed')).toBe('This session has finished.')
    expect(joinStateMessage('already')).toBe("You're already booked for this session.")
    expect(joinStateMessage('mine')).toMatch(/your booking/)
    expect(joinStateMessage('not_found')).toMatch(/expired/)
    expect(joinStateMessage('host')).toMatch(/hosting this session/)
    expect(joinStateMessage('not_allowed')).toMatch(/can't take a seat/)
    expect(joinStateMessage('something else')).toMatch(/Try again/)
  })

  it('reads the state out of an RPC error', () => {
    expect(claimErrorState({ message: 'full' })).toBe('full')
    expect(claimErrorState({ message: 'ERROR: already' })).toBe('already')
    expect(claimErrorState({ message: 'not_found' })).toBe('not_found')
    expect(claimErrorState({ message: 'host' })).toBe('host')
    expect(claimErrorState({ message: 'not_allowed' })).toBe('not_allowed')
    expect(claimErrorState({ message: 'boom' })).toBe('error')
    expect(claimErrorState(null)).toBe('error')
  })

  it('names who is coming and counts unclaimed seats', () => {
    const rows = [
      { display_name: 'Kai', is_companion: false, guests_count: 3 },
      { display_name: 'Mei Ling', is_companion: true },
      { display_name: 'Sam', is_companion: false, guests_count: 1 },
    ]
    expect(sessionGuestsLine(rows)).toBe('Kai, Mei Ling, Sam + 1 more')
    expect(sessionGuestsLine([{ display_name: '', is_companion: false, guests_count: 1 }])).toBe('Guest')
    expect(sessionGuestsLine([])).toBe('')
    expect(sessionGuestsLine(undefined)).toBe('')
  })

  it('groups guest rows by session', () => {
    const grouped = groupGuestsBySession([
      { session_id: 's1', display_name: 'A' },
      { session_id: 's2', display_name: 'B' },
      { session_id: 's1', display_name: 'C' },
    ])
    expect(grouped.s1.map((row) => row.display_name)).toEqual(['A', 'C'])
    expect(grouped.s2).toHaveLength(1)
    expect(groupGuestsBySession(null)).toEqual({})
  })

  it('reads my_companion_bookings in either shape', () => {
    expect(companionBookingsFromRpc([{ id: 'b1' }, null, { nope: 1 }])).toEqual([{ id: 'b1' }])
    expect(companionBookingsFromRpc([{ my_companion_bookings: [{ id: 'b2' }] }])).toEqual([{ id: 'b2' }])
    expect(companionBookingsFromRpc(null)).toEqual([])
  })
})
