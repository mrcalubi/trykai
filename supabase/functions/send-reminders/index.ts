// Hourly cron (00037). Guest and host reminders for sessions that start
// in 2–24 hours. Claim the sent_at column first so two runs cannot
// double-send. Protected the same way as release-payout.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { asRecord, hasValidSecret, jsonResponse, textResponse } from '../_shared/http.ts'
import {
  formatDuration,
  formatReminderSessionDate,
  GUEST_REPLY_TO,
  guestSessionReminderHtml,
  guestSessionReminderSubject,
  hostSessionReminderHtml,
  hostSessionReminderSubject,
  publicDisplayName,
  sendResendEmail,
} from '../_shared/email.ts'
import {
  REMINDER_EMAIL_CAP,
  groupBookingsBySession,
  reminderWindowIso,
} from '../_shared/reminders.ts'

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function sumAddonRows(
  rows: Array<{ name: string; quantity: number }> | undefined,
): Array<{ name: string; quantity: number }> {
  const totals = new Map<string, number>()
  for (const row of rows ?? []) {
    const name = String(row.name ?? '').trim()
    const quantity = Number(row.quantity) || 0
    if (!name || quantity < 1) continue
    totals.set(name, (totals.get(name) ?? 0) + quantity)
  }
  return [...totals.entries()].map(([name, quantity]) => ({ name, quantity }))
}

function userFields(value: unknown): {
  email?: string | null
  display_name?: string | null
  full_name?: string | null
} | null {
  const row = asRecord(value)
  if (!row || typeof row !== 'object') return null
  return row as { email?: string | null; display_name?: string | null; full_name?: string | null }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return textResponse('ok')

  const secret = Deno.env.get('REMINDERS_CRON_SECRET') ?? Deno.env.get('CRON_SECRET')
  if (!hasValidSecret(req, secret)) {
    return textResponse('Unauthorized', 401)
  }

  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )
    const apiKey = Deno.env.get('RESEND_API_KEY')
    const siteUrl = Deno.env.get('SITE_URL')
    const nowMs = Date.now()
    const sentAt = new Date(nowMs).toISOString()
    const { windowStart, windowEnd, confirmedBefore } = reminderWindowIso(nowMs)

    const summary = {
      guests_scanned: 0,
      guests_sent: 0,
      hosts_scanned: 0,
      hosts_sent: 0,
      skipped: 0,
      failed: 0,
    }
    let emailsLeft = REMINDER_EMAIL_CAP

    const { data: windowSessions, error: sessionError } = await admin
      .from('sessions')
      .select(
        `
        id,
        starts_at,
        duration_mins,
        host_reminder_sent_at,
        listings!inner (
          title,
          full_address,
          whats_provided,
          what_to_bring,
          users:host_id (
            email,
            display_name,
            full_name
          )
        )
      `,
      )
      .eq('status', 'open')
      .gte('starts_at', windowStart)
      .lte('starts_at', windowEnd)

    if (sessionError) return jsonResponse({ error: sessionError.message }, 500)

    const sessions = windowSessions ?? []
    const sessionById = new Map(sessions.map((row) => [row.id, row]))
    const sessionIds = sessions.map((row) => row.id)

    if (sessionIds.length === 0) {
      console.log('send-reminders', JSON.stringify(summary))
      return jsonResponse(summary)
    }

    const bookingSelect = `
        id,
        session_id,
        created_at,
        guests_count,
        guest_reminder_sent_at,
        addon_note,
        users:guest_id (
          email,
          display_name,
          full_name
        )
      `
    let { data: bookingRows, error: bookingError } = await admin
      .from('bookings')
      .select(bookingSelect)
      .eq('status', 'confirmed')
      .in('session_id', sessionIds)

    if (bookingError && /addon_note/.test(bookingError.message ?? '')) {
      ;({ data: bookingRows, error: bookingError } = await admin
        .from('bookings')
        .select(bookingSelect.replace(/\s*addon_note,\n/, '\n'))
        .eq('status', 'confirmed')
        .in('session_id', sessionIds))
    }

    if (bookingError) return jsonResponse({ error: bookingError.message }, 500)

    const bookings = bookingRows ?? []
    const guestDue = bookings.filter(
      (row) => !row.guest_reminder_sent_at && row.created_at && row.created_at < confirmedBefore,
    )
    summary.guests_scanned = guestDue.length

    for (const row of guestDue) {
      if (emailsLeft <= 0) break
      const session = sessionById.get(row.session_id)
      if (!session) {
        summary.skipped += 1
        continue
      }

      const { data: claimed, error: claimError } = await admin
        .from('bookings')
        .update({ guest_reminder_sent_at: sentAt })
        .eq('id', row.id)
        .is('guest_reminder_sent_at', null)
        .select('id')
        .maybeSingle()
      if (claimError || !claimed) {
        summary.skipped += 1
        continue
      }

      const listing = asRecord(session.listings)
      const host = userFields(listing?.users)
      const guest = userFields(row.users)
      const email = guest?.email
      const title = typeof listing?.title === 'string' ? listing.title : ''
      const startsAt = typeof session.starts_at === 'string' ? session.starts_at : ''
      if (!email || !title || !startsAt) {
        summary.failed += 1
        continue
      }

      await sendResendEmail({
        apiKey,
        to: email,
        subject: guestSessionReminderSubject(title, startsAt, sentAt),
        replyTo: GUEST_REPLY_TO,
        html: guestSessionReminderHtml({
          guestName: publicDisplayName(guest),
          listingTitle: title,
          sessionDate: formatReminderSessionDate(startsAt),
          startsAt,
          sentAt,
          duration: formatDuration(
            typeof session.duration_mins === 'number' ? session.duration_mins : null,
          ),
          fullAddress: typeof listing?.full_address === 'string' ? listing.full_address : '',
          whatsProvided: Array.isArray(listing?.whats_provided)
            ? (listing.whats_provided as string[])
            : null,
          whatToBring: Array.isArray(listing?.what_to_bring)
            ? (listing.what_to_bring as string[])
            : null,
          hostName: publicDisplayName(host) || 'your host',
          bookingId: row.id,
          siteUrl,
        }),
      })
      summary.guests_sent += 1
      emailsLeft -= 1
    }

    const bookingIds = bookings.map((row) => row.id)
    const { data: addonRows } = bookingIds.length
      ? await admin.from('booking_addons').select('booking_id, name, quantity').in('booking_id', bookingIds)
      : { data: [] }
    const addonsByBooking = new Map<string, Array<{ name: string; quantity: number }>>()
    for (const row of addonRows ?? []) {
      const list = addonsByBooking.get(row.booking_id) ?? []
      list.push({ name: row.name, quantity: row.quantity })
      addonsByBooking.set(row.booking_id, list)
    }

    const grouped = groupBookingsBySession(
      bookings.map((row) => ({
        sessionId: row.session_id,
        guestName: publicDisplayName(userFields(row.users)) || 'A guest',
        guestsCount: typeof row.guests_count === 'number' ? row.guests_count : 1,
      })),
    )
    const extrasBySession = new Map<
      string,
      { addons: Array<{ name: string; quantity: number }>; notes: Array<{ name: string; note: string }> }
    >()
    for (const row of bookings) {
      const extras = extrasBySession.get(row.session_id) ?? { addons: [], notes: [] }
      extras.addons.push(...(addonsByBooking.get(row.id) ?? []))
      const note = typeof row.addon_note === 'string' ? row.addon_note.trim() : ''
      if (note) {
        extras.notes.push({
          name: publicDisplayName(userFields(row.users)) || 'A guest',
          note,
        })
      }
      extrasBySession.set(row.session_id, extras)
    }
    const hostDue = sessions.filter((row) => !row.host_reminder_sent_at && grouped.has(row.id))
    summary.hosts_scanned = hostDue.length

    for (const row of hostDue) {
      if (emailsLeft <= 0) break
      const group = grouped.get(row.id)
      if (!group) {
        summary.skipped += 1
        continue
      }

      const { data: claimed, error: claimError } = await admin
        .from('sessions')
        .update({ host_reminder_sent_at: sentAt })
        .eq('id', row.id)
        .is('host_reminder_sent_at', null)
        .select('id')
        .maybeSingle()
      if (claimError || !claimed) {
        summary.skipped += 1
        continue
      }

      const listing = asRecord(row.listings)
      const host = userFields(listing?.users)
      const email = host?.email
      const title = typeof listing?.title === 'string' ? listing.title : ''
      const startsAt = typeof row.starts_at === 'string' ? row.starts_at : ''
      if (!email || !title || !startsAt) {
        summary.failed += 1
        continue
      }

      await sendResendEmail({
        apiKey,
        to: email,
        subject: hostSessionReminderSubject(title, group.totalGuests, startsAt, sentAt),
        html: hostSessionReminderHtml({
          hostName: publicDisplayName(host),
          listingTitle: title,
          sessionDate: formatReminderSessionDate(startsAt),
          startsAt,
          sentAt,
          guests: group.guests,
          totalGuests: group.totalGuests,
          siteUrl,
          addons: sumAddonRows(extrasBySession.get(row.id)?.addons),
          notes: extrasBySession.get(row.id)?.notes,
        }),
      })
      summary.hosts_sent += 1
      emailsLeft -= 1
    }

    console.log('send-reminders', JSON.stringify(summary))
    return jsonResponse(summary)
  } catch (err) {
    const message = errorMessage(err)
    console.error('send-reminders failed', message)
    return jsonResponse({ error: message }, 500)
  }
})
