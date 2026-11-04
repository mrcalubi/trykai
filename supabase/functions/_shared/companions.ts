// Who's coming (00050): load the friends who took a seat on a booking and
// email them. Called after a cancel or move has already succeeded; any failure
// here is logged and never changes the outcome of that action.

import {
  type CompanionRecipient,
  companionCancelledHtml,
  companionCancelledSubject,
  companionMovedHtml,
  companionMovedSubject,
  sendCompanionEmails,
  sendResendEmail,
} from './email.ts'

type AdminLike = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => PromiseLike<{ data: unknown; error: unknown }>
    }
  }
}

export async function loadCompanionRecipients(
  admin: AdminLike,
  bookingId: string,
): Promise<CompanionRecipient[]> {
  const { data, error } = await admin
    .from('booking_guests')
    .select('user_id, users:user_id ( email, display_name, full_name )')
    .eq('booking_id', bookingId)
  if (error || !Array.isArray(data)) return []
  return data
    .map((row) => (row as { users?: CompanionRecipient | CompanionRecipient[] | null }).users)
    .map((users) => (Array.isArray(users) ? users[0] : users))
    .filter((person): person is CompanionRecipient => Boolean(person?.email))
}

export async function emailCompanionsCancelled(
  admin: AdminLike,
  options: {
    bookingId: string
    cancelledByName: string
    listingTitle: string
    sessionDate: string
    listingId?: string | null
    apiKey: string | undefined
    siteUrl?: string
    send?: typeof sendResendEmail
  },
): Promise<number> {
  try {
    const recipients = await loadCompanionRecipients(admin, options.bookingId)
    if (!recipients.length) return 0
    return await sendCompanionEmails({
      apiKey: options.apiKey,
      recipients,
      subject: companionCancelledSubject(options.listingTitle),
      html: (companionName) =>
        companionCancelledHtml({
          companionName,
          cancelledByName: options.cancelledByName,
          listingTitle: options.listingTitle,
          sessionDate: options.sessionDate,
          listingId: options.listingId,
          siteUrl: options.siteUrl,
        }),
      send: options.send,
    })
  } catch (err) {
    console.error('companion cancel emails failed', err instanceof Error ? err.message : err)
    return 0
  }
}

export async function emailCompanionsMoved(
  admin: AdminLike,
  options: {
    bookingId: string
    bookerName: string
    listingTitle: string
    newSessionDate: string
    apiKey: string | undefined
    siteUrl?: string
    send?: typeof sendResendEmail
  },
): Promise<number> {
  try {
    const recipients = await loadCompanionRecipients(admin, options.bookingId)
    if (!recipients.length) return 0
    return await sendCompanionEmails({
      apiKey: options.apiKey,
      recipients,
      subject: companionMovedSubject(options.listingTitle, options.newSessionDate),
      html: (companionName) =>
        companionMovedHtml({
          companionName,
          bookerName: options.bookerName,
          listingTitle: options.listingTitle,
          newSessionDate: options.newSessionDate,
          bookingId: options.bookingId,
          siteUrl: options.siteUrl,
        }),
      send: options.send,
    })
  } catch (err) {
    console.error('companion move emails failed', err instanceof Error ? err.message : err)
    return 0
  }
}
