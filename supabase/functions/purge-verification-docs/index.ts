import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  COMPLAINT_EVIDENCE_RETENTION_DAYS,
  complaintEvidenceCutoffIso,
} from '../_shared/complaints.ts'
import { hasValidSecret, jsonResponse, textResponse } from '../_shared/http.ts'
import {
  purgeCandidatePaths,
  REJECTED_DOCUMENT_RETENTION_DAYS,
  retentionCutoffIso,
  shouldPurgeDocuments,
} from '../_shared/verification.ts'

const BUCKET = 'verification-docs'
const COMPLAINT_BUCKET = 'complaint-evidence'

/**
 * Deletes the identity documents of rejected hosts once the retention window
 * has passed, which is the promise DECISIONS.md makes and PDPC expects an
 * organisation holding NRIC copies to keep. Schedule daily.
 *
 * Also deletes guest complaint photos (00031) COMPLAINT_EVIDENCE_RETENTION_DAYS
 * after the complaint. The complaint text stays as the record.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return textResponse('ok')

  const secret = Deno.env.get('VERIFICATION_PURGE_SECRET') ?? Deno.env.get('CRON_SECRET')
  if (!hasValidSecret(req, secret)) {
    return textResponse('Unauthorized', 401)
  }

  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const cutoff = retentionCutoffIso()

    const { data: rows, error } = await admin
      .from('users')
      .select('id, verification_status, verification_reviewed_at, id_photo_url, selfie_url')
      .eq('verification_status', 'rejected')
      .lte('verification_reviewed_at', cutoff)

    if (error) return jsonResponse({ error: error.message }, 500)

    const due = (rows ?? []).filter((row) => shouldPurgeDocuments(row))
    const complaints = await purgeComplaintEvidence(admin)

    if (!due.length) {
      return jsonResponse({
        message: `No documents past the ${REJECTED_DOCUMENT_RETENTION_DAYS}-day window`,
        purged: 0,
        failed: [],
        complaints,
      })
    }

    const purged: string[] = []
    const failed: { id: string; error: string }[] = []

    for (const candidate of due) {
      const paths = purgeCandidatePaths(candidate)

      const { error: removeError } = await admin.storage.from(BUCKET).remove(paths)
      if (removeError) {
        // Leave the row untouched so the next run retries it. Clearing the
        // paths here would orphan the objects with nothing pointing at them.
        failed.push({ id: candidate.id, error: removeError.message })
        continue
      }

      const { error: updateError } = await admin
        .from('users')
        .update({ id_photo_url: null, selfie_url: null })
        .eq('id', candidate.id)
        .eq('verification_status', 'rejected')

      if (updateError) {
        failed.push({ id: candidate.id, error: updateError.message })
        continue
      }

      purged.push(candidate.id)
    }

    if (failed.length) console.error('purge-verification-docs: some rows failed', failed)

    return jsonResponse({ purged: purged.length, failed, complaints })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error'
    console.error('purge-verification-docs failed', message)
    return jsonResponse({ error: message }, 500)
  }
})

async function purgeComplaintEvidence(
  admin: ReturnType<typeof createClient>,
): Promise<{ purged: number; failed: { id: string; error: string }[]; retention_days: number }> {
  const failed: { id: string; error: string }[] = []
  let purged = 0
  const { data: rows, error } = await admin
    .from('booking_complaints')
    .select('id, photo_paths')
    .is('photos_purged_at', null)
    .lte('created_at', complaintEvidenceCutoffIso())
  if (error) {
    failed.push({ id: '*', error: error.message })
    return { purged, failed, retention_days: COMPLAINT_EVIDENCE_RETENTION_DAYS }
  }
  for (const row of (rows ?? []) as { id: string; photo_paths: string[] | null }[]) {
    const paths = row.photo_paths ?? []
    if (paths.length) {
      const { error: removeError } = await admin.storage.from(COMPLAINT_BUCKET).remove(paths)
      if (removeError) {
        // Keep the paths so the next run retries.
        failed.push({ id: row.id, error: removeError.message })
        continue
      }
    }
    const { error: updateError } = await admin
      .from('booking_complaints')
      .update({ photo_paths: [], photos_purged_at: new Date().toISOString() })
      .eq('id', row.id)
    if (updateError) {
      failed.push({ id: row.id, error: updateError.message })
      continue
    }
    purged += 1
  }
  if (failed.length) console.error('purge-verification-docs: complaint evidence failures', failed)
  return { purged, failed, retention_days: COMPLAINT_EVIDENCE_RETENTION_DAYS }
}
