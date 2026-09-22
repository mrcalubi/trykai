const RESEND_FROM = 'TryKai <no-reply@trykai.sg>'

export function formatCents(cents: number): string {
  const dollars = cents / 100
  return dollars % 1 === 0 ? `$${dollars}` : `$${dollars.toFixed(2)}`
}

export async function sendResendEmail(options: {
  apiKey: string | undefined
  to: string | null | undefined
  subject: string
  html: string
}): Promise<void> {
  if (!options.apiKey) {
    console.error('sendResendEmail: RESEND_API_KEY is missing; email not sent', {
      to: options.to,
      subject: options.subject,
    })
    return
  }
  if (!options.to) return

  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: RESEND_FROM,
        to: options.to,
        subject: options.subject,
        html: options.html,
      }),
    })
  } catch (err) {
    console.error('sendResendEmail: Resend request failed', err)
  }
}

export function bookingConfirmedGuestHtml(options: {
  listingTitle: string
  sessionDate: string
  guestsCount: number
}): string {
  return `
    <h2>Your booking is confirmed</h2>
    <p>You are booked for <strong>${options.listingTitle}</strong>.</p>
    <p><strong>Session:</strong> ${options.sessionDate}</p>
    <p><strong>Guests:</strong> ${options.guestsCount}</p>
    <p>The full address is in your <a href="https://trykai.sg/dashboard">TryKai dashboard</a>.</p>
  `
}

export function bookingConfirmedHostHtml(options: {
  guestName: string
  listingTitle: string
  sessionDate: string
  guestsCount: number
}): string {
  return `
    <h2>You've got a new booking!</h2>
    <p><strong>${options.guestName}</strong> just booked your session.</p>
    <p><strong>Listing:</strong> ${options.listingTitle}</p>
    <p><strong>Session:</strong> ${options.sessionDate}</p>
    <p><strong>Guests:</strong> ${options.guestsCount}</p>
    <p>Log in to your <a href="https://trykai.sg/dashboard">TryKai dashboard</a> to view details.</p>
  `
}

export function verificationApprovedHtml(options: { hostName?: string | null }): string {
  const greeting = options.hostName ? `You're verified, ${options.hostName}!` : "You're verified!"
  return `
    <h2>${greeting}</h2>
    <p>Your identity verification has been approved. You can now create listings on TryKai.</p>
    <p><a href="https://trykai.sg/create-listing">Create your first listing</a></p>
  `
}

/**
 * The reason is the whole point of this email: "rejected" with no explanation
 * is not a state a host can act on. It is written by a reviewer, so escape it.
 */
export function verificationRejectedHtml(options: {
  hostName?: string | null
  reason: string
}): string {
  const greeting = options.hostName ? `Hi ${options.hostName},` : 'Hi,'
  return `
    <h2>${greeting}</h2>
    <p>We were unable to verify your identity with the documents provided.</p>
    <p><strong>What we found:</strong> ${escapeHtml(options.reason)}</p>
    <p>You can submit new documents whenever you are ready.</p>
    <p><a href="https://trykai.sg/verify-identity">Resubmit verification</a></p>
  `
}

export function bookingCancelledGuestHtml(options: {
  listingTitle: string
  sessionDate: string
  refundAmountCents: number
  cancelledBy: 'guest' | 'host'
}): string {
  const who =
    options.cancelledBy === 'host'
      ? 'The host cancelled your booking'
      : 'Your booking has been cancelled'
  return `
    <h2>${who}</h2>
    <p>The session was <strong>${escapeHtml(options.listingTitle)}</strong> on ${escapeHtml(options.sessionDate)}.</p>
    <p><strong>Refund amount:</strong> ${formatCents(options.refundAmountCents)}</p>
    <p>Any refund goes back to your original payment method. Details are in your <a href="https://trykai.sg/dashboard">TryKai dashboard</a>.</p>
  `
}

export function bookingCancelledHostHtml(options: {
  guestName: string
  listingTitle: string
  sessionDate: string
}): string {
  return `
    <h2>A guest cancelled</h2>
    <p><strong>${escapeHtml(options.guestName)}</strong> cancelled their booking for <strong>${escapeHtml(options.listingTitle)}</strong>.</p>
    <p><strong>Session:</strong> ${escapeHtml(options.sessionDate)}</p>
    <p>The spot is available again. See your <a href="https://trykai.sg/dashboard">TryKai dashboard</a>.</p>
  `
}

/**
 * Guest always hears the refund amount, including $0. The host is only told
 * when the guest cancelled — the host already knows about their own cancel.
 * Never throws: a Resend failure must not undo a refund that already happened.
 */
export async function sendCancellationEmails(options: {
  apiKey: string | undefined
  cancelledBy: 'guest' | 'host'
  refundAmountCents: number
  listingTitle: string
  sessionDate: string
  guestEmail: string | null | undefined
  hostEmail: string | null | undefined
  guestName?: string | null
}): Promise<void> {
  try {
    await sendResendEmail({
      apiKey: options.apiKey,
      to: options.guestEmail,
      subject: `Booking cancelled: ${options.listingTitle}`,
      html: bookingCancelledGuestHtml({
        listingTitle: options.listingTitle,
        sessionDate: options.sessionDate,
        refundAmountCents: options.refundAmountCents,
        cancelledBy: options.cancelledBy,
      }),
    })
    if (options.cancelledBy === 'guest') {
      await sendResendEmail({
        apiKey: options.apiKey,
        to: options.hostEmail,
        subject: `A guest cancelled "${options.listingTitle}"`,
        html: bookingCancelledHostHtml({
          guestName: options.guestName || 'A guest',
          listingTitle: options.listingTitle,
          sessionDate: options.sessionDate,
        }),
      })
    }
  } catch (err) {
    console.error('sendCancellationEmails failed', err)
  }
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function formatSessionDate(iso: string): string {
  return new Date(iso).toLocaleString('en-SG', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Singapore',
  })
}
