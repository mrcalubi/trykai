const RESEND_FROM = 'TryKai <onboarding@resend.dev>'

export async function sendResendEmail(options: {
  apiKey: string | undefined
  to: string | null | undefined
  subject: string
  html: string
}): Promise<void> {
  if (!options.apiKey || !options.to) return

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
