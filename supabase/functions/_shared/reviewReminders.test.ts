import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  isMissingFunction,
  reviewReminderEmail,
  sendReviewReminders,
  type ReviewReminderRow,
} from './reviewReminders.ts'
import {
  reviewPromptGuestHtml,
  reviewPromptGuestSubject,
  reviewPromptHostHtml,
  reviewPromptHostSubject,
} from './email.ts'

const deadline = '2026-11-13T07:30:00.000Z' // Fri, 13 Nov in Singapore

function row(overrides: Partial<ReviewReminderRow> = {}): ReviewReminderRow {
  return {
    kind: 'guest_prompt',
    booking_id: 'booking-1',
    session_id: 'session-1',
    recipient_email: 'kai@trykai.test',
    recipient_name: 'Kai',
    other_name: 'Aakash',
    listing_title: 'DJ Basics',
    deadline,
    people: null,
    ...overrides,
  }
}

function adminReturning(data: unknown, error: { message?: string; code?: string } | null = null) {
  return { rpc: vi.fn(async () => ({ data, error })) }
}

describe('review reminder emails', () => {
  it('asks the guest how it went, with a link to the review and the closing day', () => {
    const email = reviewReminderEmail(row(), 'https://trykai.sg')!
    expect(email.to).toBe('kai@trykai.test')
    expect(email.subject).toBe('How was DJ Basics?')
    expect(email.replyTo).toBe('hello@trykai.sg')
    expect(email.html).toContain('Hi Kai,')
    expect(email.html).toContain('How was it with Aakash?')
    expect(email.html).toContain('Leave a review by Fri, 13 Nov')
    expect(email.html).toContain('https://trykai.sg/bookings/booking-1#review')
  })

  it('reminds the guest two days before reviews close', () => {
    const email = reviewReminderEmail(row({ kind: 'guest_nudge' }), 'https://trykai.sg')!
    expect(email.subject).toBe('2 days left to review DJ Basics')
    expect(email.html).toContain('Your review closes Fri, 13 Nov')
    expect(email.html).toContain('Aakash is waiting to hear how DJ Basics went.')
  })

  it('lists the guests a host has not reviewed, friends included', () => {
    const email = reviewReminderEmail(
      row({
        kind: 'host_prompt',
        booking_id: null,
        recipient_email: 'aakash@trykai.test',
        recipient_name: 'Aakash',
        other_name: null,
        people: ['Kai', 'Airica'],
      }),
      'https://trykai.sg',
    )!
    expect(email.to).toBe('aakash@trykai.test')
    expect(email.subject).toBe('Review your guests from DJ Basics')
    expect(email.replyTo).toBeUndefined()
    expect(email.html).toContain('How were your guests?')
    expect(email.html).toContain('<li style="margin:0 0 4px;">Kai</li>')
    expect(email.html).toContain('<li style="margin:0 0 4px;">Airica</li>')
    expect(email.html).toContain('Reviews close Fri, 13 Nov.')
    expect(email.html).toContain('https://trykai.sg/hosting')
    expect(email.html).toContain('Review your guests')
  })

  it('reminds the host, singular button for one guest', () => {
    const email = reviewReminderEmail(
      row({ kind: 'host_nudge', booking_id: null, recipient_name: 'Aakash', people: ['Kai'] }),
      'https://trykai.sg',
    )!
    expect(email.subject).toBe('2 days left to review your guests')
    expect(email.html).toContain('Reviews close Fri, 13 Nov')
    expect(email.html).toContain('Review your guest<')
  })

  it('skips rows it cannot address', () => {
    expect(reviewReminderEmail(row({ recipient_email: null }))).toBeNull()
    expect(reviewReminderEmail(row({ listing_title: ' ' }))).toBeNull()
    expect(reviewReminderEmail(row({ deadline: null }))).toBeNull()
    expect(reviewReminderEmail(row({ booking_id: null }))).toBeNull()
    expect(reviewReminderEmail(row({ kind: 'host_prompt', people: [] }))).toBeNull()
    expect(reviewReminderEmail(row({ kind: 'host_prompt', people: null }))).toBeNull()
  })

  it('escapes names and titles', () => {
    const guest = reviewPromptGuestHtml({
      guestName: '<b>Kai</b>',
      hostName: '<i>A</i>',
      listingTitle: '<script>x</script>',
      deadline: 'Fri',
      bookingId: 'b"1',
      reminder: false,
    })
    expect(guest).not.toContain('<script>x</script>')
    expect(guest).not.toContain('<b>Kai</b>')
    expect(guest).not.toContain('<i>A</i>')
    const host = reviewPromptHostHtml({
      hostName: 'A',
      listingTitle: 'T & U',
      people: ['<img src=x>'],
      deadline: 'Fri',
      reminder: true,
    })
    expect(host).not.toContain('<img src=x>')
    expect(reviewPromptGuestSubject('X', false)).toBe('How was X?')
    expect(reviewPromptHostSubject('X', true)).toBe('2 days left to review your guests')
  })
})

describe('sendReviewReminders', () => {
  it('claims with the cap and sends one email per row', async () => {
    const admin = adminReturning([row(), row({ kind: 'host_prompt', booking_id: null, people: ['Kai'] })])
    const send = vi.fn(async () => {})
    const summary = await sendReviewReminders(admin, { apiKey: 'k', siteUrl: 'https://trykai.sg', cap: 150, send })
    expect(admin.rpc).toHaveBeenCalledWith('claim_review_reminders', { p_limit: 150 })
    expect(send).toHaveBeenCalledTimes(2)
    expect(summary).toEqual({ review_emails_sent: 2, review_emails_failed: 0, review_reminders_skipped: false })
  })

  it('counts a failed send and carries on', async () => {
    const admin = adminReturning([row(), row({ booking_id: 'booking-2' }), row({ recipient_email: null })])
    const send = vi.fn().mockRejectedValueOnce(new Error('bounce')).mockResolvedValueOnce(undefined)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const summary = await sendReviewReminders(admin, { apiKey: 'k', cap: 10, send })
    expect(summary.review_emails_sent).toBe(1)
    expect(summary.review_emails_failed).toBe(2)
    errorSpy.mockRestore()
  })

  it('skips quietly before 00051 is applied', async () => {
    const admin = adminReturning(null, {
      code: 'PGRST202',
      message: 'Could not find the function public.claim_review_reminders(p_limit) in the schema cache',
    })
    const send = vi.fn()
    const summary = await sendReviewReminders(admin, { apiKey: 'k', cap: 10, send })
    expect(summary.review_reminders_skipped).toBe(true)
    expect(send).not.toHaveBeenCalled()
  })

  it('throws on any other database error so the job logs it', async () => {
    const admin = adminReturning(null, { message: 'permission denied' })
    await expect(sendReviewReminders(admin, { apiKey: 'k', cap: 10 })).rejects.toThrow(/permission denied/)
  })

  it('does nothing when the email cap is used up', async () => {
    const admin = adminReturning([row()])
    const summary = await sendReviewReminders(admin, { apiKey: 'k', cap: 0 })
    expect(admin.rpc).not.toHaveBeenCalled()
    expect(summary.review_emails_sent).toBe(0)
  })

  it('recognises a missing function', () => {
    expect(isMissingFunction(null)).toBe(false)
    expect(isMissingFunction({ code: 'PGRST202' })).toBe(true)
    expect(isMissingFunction({ message: 'function public.claim_review_reminders(integer) does not exist' })).toBe(true)
    expect(isMissingFunction({ message: 'timeout' })).toBe(false)
  })
})

describe('send-reminders wiring', () => {
  const source = readFileSync(resolve(import.meta.dirname, '../send-reminders/index.ts'), 'utf8')

  it('sends review reminders inside their own try, before session reminders', () => {
    const reviewAt = source.indexOf('await sendReviewReminders(admin')
    const sessionsAt = source.indexOf(".from('sessions')")
    expect(reviewAt).toBeGreaterThan(-1)
    expect(reviewAt).toBeLessThan(sessionsAt)
    expect(source.slice(source.lastIndexOf('try {', reviewAt), reviewAt)).toMatch(/try \{\s*reviewSummary =/)
    expect(source).toMatch(/let emailsLeft = REMINDER_EMAIL_CAP - reviewSummary\.review_emails_sent/)
  })
})
