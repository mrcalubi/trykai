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

export function formatSessionDate(iso: string): string {
  return new Date(iso).toLocaleString('en-SG', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Singapore',
  })
}
