// Review prompts and reminders (00051), sent from the hourly send-reminders
// job. claim_review_reminders() picks and claims due rows in the database,
// so this only formats and sends. A failed send is logged, not retried (same
// rule as the session reminders).

import {
  formatSessionDay,
  GUEST_REPLY_TO,
  reviewPromptGuestHtml,
  reviewPromptGuestSubject,
  reviewPromptHostHtml,
  reviewPromptHostSubject,
  sendResendEmail,
} from './email.ts'

export type ReviewReminderKind = 'guest_prompt' | 'guest_nudge' | 'host_prompt' | 'host_nudge'

export type ReviewReminderRow = {
  kind: ReviewReminderKind
  booking_id: string | null
  session_id: string
  recipient_email: string | null
  recipient_name: string | null
  other_name: string | null
  listing_title: string | null
  deadline: string | null
  people: string[] | null
}

export type ReviewReminderSummary = {
  review_emails_sent: number
  review_emails_failed: number
  review_reminders_skipped: boolean
}

type RpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message?: string; code?: string } | null }>
}

/** 00051 not applied yet: skip review emails, keep session reminders working. */
export function isMissingFunction(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false
  return error.code === 'PGRST202' || /claim_review_reminders/.test(error.message ?? '')
}

export function reviewReminderEmail(
  row: ReviewReminderRow,
  siteUrl?: string,
): { to: string; subject: string; html: string; replyTo?: string } | null {
  const to = row.recipient_email
  const title = (row.listing_title || '').trim()
  if (!to || !title || !row.deadline) return null
  const deadline = formatSessionDay(row.deadline)
  const reminder = row.kind === 'guest_nudge' || row.kind === 'host_nudge'

  if (row.kind === 'guest_prompt' || row.kind === 'guest_nudge') {
    if (!row.booking_id) return null
    return {
      to,
      subject: reviewPromptGuestSubject(title, reminder),
      replyTo: GUEST_REPLY_TO,
      html: reviewPromptGuestHtml({
        guestName: row.recipient_name,
        hostName: row.other_name,
        listingTitle: title,
        deadline,
        bookingId: row.booking_id,
        reminder,
        siteUrl,
      }),
    }
  }

  const people = Array.isArray(row.people) ? row.people : []
  if (people.length === 0) return null
  return {
    to,
    subject: reviewPromptHostSubject(title, reminder),
    html: reviewPromptHostHtml({
      hostName: row.recipient_name,
      listingTitle: title,
      people,
      deadline,
      reminder,
      siteUrl,
    }),
  }
}

export async function sendReviewReminders(
  admin: RpcClient,
  options: { apiKey: string | undefined; siteUrl?: string; cap: number; send?: typeof sendResendEmail },
): Promise<ReviewReminderSummary> {
  const summary: ReviewReminderSummary = {
    review_emails_sent: 0,
    review_emails_failed: 0,
    review_reminders_skipped: false,
  }
  if (options.cap <= 0) return summary
  const send = options.send ?? sendResendEmail

  const { data, error } = await admin.rpc('claim_review_reminders', { p_limit: options.cap })
  if (error) {
    if (isMissingFunction(error)) {
      summary.review_reminders_skipped = true
      return summary
    }
    throw new Error(`claim_review_reminders: ${error.message ?? 'failed'}`)
  }

  for (const row of (Array.isArray(data) ? data : []) as ReviewReminderRow[]) {
    const email = reviewReminderEmail(row, options.siteUrl)
    if (!email) {
      summary.review_emails_failed += 1
      continue
    }
    try {
      await send({ apiKey: options.apiKey, ...email })
      summary.review_emails_sent += 1
    } catch (err) {
      summary.review_emails_failed += 1
      console.error('review reminder failed', row.kind, err instanceof Error ? err.message : err)
    }
  }
  return summary
}
