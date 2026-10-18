import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  COMPLAINT_HOLD_REASON,
  complaintDecision,
  complaintPhotoPath,
  validateComplaint,
} from '../_shared/complaints.ts'
import { formatSessionDate, publicDisplayName, sendComplaintEmails } from '../_shared/email.ts'
import { asRecord, jsonResponse, textResponse } from '../_shared/http.ts'

// Guest "Report a problem" from the booking page (Dispute Policy, quality
// complaints). multipart/form-data: booking_id, description, photos (0 to 3).
// The guest's own JWT; everything else runs as the service role.

const BUCKET = 'complaint-evidence'

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return textResponse('ok')

  try {
    const authHeader = req.headers.get('Authorization')
    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader ?? '' } } },
    )
    const {
      data: { user },
    } = await supabaseAuth.auth.getUser()
    if (!user) return jsonResponse({ error: 'Please sign in to report a problem.' }, 401)

    const form = await req.formData().catch(() => null)
    if (!form) return jsonResponse({ error: 'Send the report as a form.' }, 400)
    const bookingId = form.get('booking_id')
    if (typeof bookingId !== 'string' || !bookingId) {
      return jsonResponse({ error: 'booking_id is required' }, 400)
    }
    const photos = form.getAll('photos').filter((value): value is File => value instanceof File)

    const input = validateComplaint({ description: form.get('description'), photos })
    if (!input.ok) return jsonResponse({ error: input.error }, input.status)

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const { data: booking, error } = await admin
      .from('bookings')
      .select(
        `
        id,
        status,
        guest_id,
        sessions ( starts_at, duration_mins, listings ( title, duration_mins ) )
      `,
      )
      .eq('id', bookingId)
      .maybeSingle()
    if (error || !booking) return jsonResponse({ error: 'Booking not found' }, 404)

    const { data: existing } = await admin
      .from('booking_complaints')
      .select('id')
      .eq('booking_id', booking.id)
      .maybeSingle()

    const session = asRecord(
      booking.sessions as
        | { starts_at?: string; duration_mins?: number; listings?: unknown }
        | null,
    )
    const listing = asRecord(session?.listings as { title?: string; duration_mins?: number } | null)
    const decision = complaintDecision({
      callerId: user.id,
      booking: {
        guest_id: booking.guest_id,
        status: booking.status,
        sessions: session ? { ...session, listings: listing } : null,
      },
      alreadyReported: Boolean(existing),
    })
    if (!decision.ok) return jsonResponse({ error: decision.error }, decision.status)

    const { data: complaint, error: insertError } = await admin
      .from('booking_complaints')
      .insert({ booking_id: booking.id, guest_id: user.id, description: input.description })
      .select('id, created_at')
      .single()
    if (insertError || !complaint) {
      if (insertError?.code === '23505') {
        return jsonResponse(
          { error: "You've already reported this booking. Reply to our email to add anything." },
          409,
        )
      }
      return jsonResponse({ error: insertError?.message ?? 'Could not save the report' }, 500)
    }

    // Hold before anything slow, so the hourly payout run cannot pay the host
    // while photos upload. Guarded: never touches a paid, refunded, or
    // already-held booking.
    const { data: held } = await admin
      .from('bookings')
      .update({ payout_hold_reason: COMPLAINT_HOLD_REASON, payout_held_at: new Date().toISOString() })
      .eq('id', booking.id)
      .eq('status', 'confirmed')
      .is('payout_released_at', null)
      .is('stripe_refund_id', null)
      .is('payout_hold_reason', null)
      .select('id')
    const payoutHeld = Boolean(held && held.length > 0)

    const photoPaths: string[] = []
    let photoFailures = 0
    for (const [index, photo] of photos.entries()) {
      const path = complaintPhotoPath(booking.id, complaint.id, index, photo.type)
      const { error: uploadError } = await admin.storage
        .from(BUCKET)
        .upload(path, photo, { contentType: photo.type, upsert: false })
      if (uploadError) {
        photoFailures += 1
        console.error('report-booking-problem: photo upload failed', booking.id, uploadError.message)
      } else {
        photoPaths.push(path)
      }
    }
    if (photoPaths.length) {
      const { error: pathError } = await admin
        .from('booking_complaints')
        .update({ photo_paths: photoPaths })
        .eq('id', complaint.id)
      if (pathError) console.error('report-booking-problem: could not store photo paths', pathError.message)
    }

    try {
      const { data: guestProfile } = await admin
        .from('users')
        .select('email, full_name, display_name')
        .eq('id', user.id)
        .maybeSingle()
      await sendComplaintEmails({
        apiKey: Deno.env.get('RESEND_API_KEY'),
        opsEmail: Deno.env.get('ADMIN_NOTIFY_EMAIL') ?? 'calebong2002@gmail.com',
        guestEmail: guestProfile?.email ?? user.email,
        guestName: publicDisplayName(guestProfile),
        bookingId: booking.id,
        listingTitle: listing?.title || 'your session',
        sessionDate: session?.starts_at ? formatSessionDate(session.starts_at) : '',
        description: input.description,
        photoPaths,
        photoFailures,
        payoutHeld,
        siteUrl: Deno.env.get('SITE_URL'),
      })
    } catch (emailErr) {
      console.error('report-booking-problem: email failed', emailErr)
    }

    return jsonResponse({
      ok: true,
      complaint_id: complaint.id,
      created_at: complaint.created_at,
      photos_saved: photoPaths.length,
      photos_failed: photoFailures,
    })
  } catch (err) {
    const message = errorMessage(err)
    console.error('report-booking-problem failed', message)
    return jsonResponse({ error: message }, 500)
  }
})
