import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  emailCompanionsCancelled,
  emailCompanionsMoved,
  loadCompanionRecipients,
} from './companions.ts'
import {
  companionCancelledHtml,
  companionCancelledSubject,
  companionMovedHtml,
  companionMovedSubject,
  sendCompanionEmails,
} from './email.ts'

function adminWith(data: unknown, error: unknown = null) {
  const eq = vi.fn(async () => ({ data, error }))
  const select = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ select }))
  return { admin: { from }, from, select, eq }
}

const friends = [
  { user_id: 'u1', users: { email: 'mei@trykai.test', display_name: 'Mei Ling', full_name: 'Mei Ling Tan' } },
  { user_id: 'u2', users: [{ email: 'sam@trykai.test', display_name: 'Sam', full_name: 'Sam Lee' }] },
  { user_id: 'u3', users: { email: null, display_name: 'No Email' } },
]

describe('loadCompanionRecipients', () => {
  it('reads friends on the booking and skips anyone without an email', async () => {
    const { admin, from, eq } = adminWith(friends)
    const people = await loadCompanionRecipients(admin, 'booking-1')
    expect(from).toHaveBeenCalledWith('booking_guests')
    expect(eq).toHaveBeenCalledWith('booking_id', 'booking-1')
    expect(people.map((p) => p.email)).toEqual(['mei@trykai.test', 'sam@trykai.test'])
  })

  it('returns nobody when the read fails', async () => {
    const { admin } = adminWith(null, { message: 'boom' })
    expect(await loadCompanionRecipients(admin, 'booking-1')).toEqual([])
  })
})

describe('companion emails', () => {
  it('tells each friend the booking was cancelled, by name, with no amounts', async () => {
    const { admin } = adminWith(friends)
    const send = vi.fn(async () => {})
    const sent = await emailCompanionsCancelled(admin, {
      bookingId: 'booking-1',
      cancelledByName: 'Kai',
      listingTitle: 'Flower arranging',
      sessionDate: 'Sat, 7 Nov',
      listingId: 'listing-1',
      apiKey: 'key',
      siteUrl: 'https://trykai.sg',
      send,
    })
    expect(sent).toBe(2)
    expect(send).toHaveBeenCalledTimes(2)
    const first = send.mock.calls[0][0] as { to: string; subject: string; html: string; replyTo: string }
    expect(first.to).toBe('mei@trykai.test')
    expect(first.subject).toBe('Cancelled: Flower arranging')
    expect(first.replyTo).toBe('hello@trykai.sg')
    expect(first.html).toContain('Hi Mei Ling,')
    expect(first.html).toContain('Kai cancelled Flower arranging')
    expect(first.html).toContain('https://trykai.sg/listings/listing-1')
    expect(first.html).not.toMatch(/\$\d/)
  })

  it('tells each friend the booking moved', async () => {
    const { admin } = adminWith(friends.slice(0, 1))
    const send = vi.fn(async () => {})
    const sent = await emailCompanionsMoved(admin, {
      bookingId: 'booking-1',
      bookerName: 'Kai',
      listingTitle: 'Flower arranging',
      newSessionDate: 'Sun, 8 Nov',
      apiKey: 'key',
      siteUrl: 'https://trykai.sg',
      send,
    })
    expect(sent).toBe(1)
    const mail = send.mock.calls[0][0] as { subject: string; html: string }
    expect(mail.subject).toBe('Moved: Flower arranging is now Sun, 8 Nov')
    expect(mail.html).toContain('Kai moved your booking')
    expect(mail.html).toContain('https://trykai.sg/bookings/booking-1')
  })

  it('sends nothing when nobody took a seat', async () => {
    const { admin } = adminWith([])
    const send = vi.fn(async () => {})
    expect(
      await emailCompanionsMoved(admin, {
        bookingId: 'b',
        bookerName: 'Kai',
        listingTitle: 'X',
        newSessionDate: 'Y',
        apiKey: 'key',
        send,
      }),
    ).toBe(0)
    expect(
      await emailCompanionsCancelled(admin, {
        bookingId: 'b',
        cancelledByName: 'Kai',
        listingTitle: 'X',
        sessionDate: 'Y',
        apiKey: 'key',
        send,
      }),
    ).toBe(0)
    expect(send).not.toHaveBeenCalled()
  })

  it('never throws when the read itself throws', async () => {
    const admin = {
      from: () => ({
        select: () => ({
          eq: async () => {
            throw new Error('network')
          },
        }),
      }),
    }
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(
      await emailCompanionsCancelled(admin, {
        bookingId: 'b',
        cancelledByName: 'Kai',
        listingTitle: 'X',
        sessionDate: 'Y',
        apiKey: 'key',
      }),
    ).toBe(0)
    expect(
      await emailCompanionsMoved(admin, {
        bookingId: 'b',
        bookerName: 'Kai',
        listingTitle: 'X',
        newSessionDate: 'Y',
        apiKey: 'key',
      }),
    ).toBe(0)
    errorSpy.mockRestore()
  })

  it('keeps going when one send fails', async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(new Error('bounce'))
      .mockResolvedValueOnce(undefined)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const sent = await sendCompanionEmails({
      apiKey: 'key',
      recipients: [{ email: 'a@x.test' }, { email: 'b@x.test' }, { email: null }],
      subject: 's',
      html: () => '<p>x</p>',
      send,
    })
    expect(sent).toBe(1)
    expect(send).toHaveBeenCalledTimes(2)
    errorSpy.mockRestore()
  })

  it('escapes names and titles in the HTML', () => {
    const html = companionCancelledHtml({
      companionName: '<b>Mei</b>',
      cancelledByName: 'Kai & Co',
      listingTitle: '<script>x</script>',
      sessionDate: 'Sat',
    })
    expect(html).not.toContain('<script>x</script>')
    expect(html).not.toContain('<b>Mei</b>')
    const moved = companionMovedHtml({
      bookerName: '<i>Kai</i>',
      listingTitle: 'A & B',
      newSessionDate: 'Sun',
      bookingId: 'b"1',
    })
    expect(moved).not.toContain('<i>Kai</i>')
    expect(companionCancelledSubject('Latte')).toBe('Cancelled: Latte')
    expect(companionMovedSubject('Latte', 'Sun')).toBe('Moved: Latte is now Sun')
  })
})

describe('Edge Functions email friends after the action succeeds', () => {
  const cancel = readFileSync(resolve(import.meta.dirname, '../cancel-booking/index.ts'), 'utf8')
  const reschedule = readFileSync(resolve(import.meta.dirname, '../reschedule-booking/index.ts'), 'utf8')
  const adminCancel = readFileSync(resolve(import.meta.dirname, '../admin-cancel-booking/index.ts'), 'utf8')

  it('cancel-booking, admin-cancel-booking and reschedule-booking call the companion helpers', () => {
    expect(cancel).toMatch(/emailCompanionsCancelled\(admin,/)
    expect(adminCancel).toMatch(/emailCompanionsCancelled\(admin,/)
    expect(adminCancel).toMatch(/cancelledByName: 'TryKai'/)
    expect(reschedule).toMatch(/emailCompanionsMoved\(admin,/)
  })
})
