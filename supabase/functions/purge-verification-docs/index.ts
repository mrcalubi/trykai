import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { hasValidSecret, jsonResponse, textResponse } from '../_shared/http.ts'
import {
  purgeCandidatePaths,
  REJECTED_DOCUMENT_RETENTION_DAYS,
  retentionCutoffIso,
  shouldPurgeDocuments,
} from '../_shared/verification.ts'

const BUCKET = 'verification-docs'

/**
 * Deletes the identity documents of rejected hosts once the retention window
 * has passed, which is the promise DECISIONS.md makes and PDPC expects an
 * organisation holding NRIC copies to keep. Schedule daily.
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

    if (!due.length) {
      return textResponse(`No documents past the ${REJECTED_DOCUMENT_RETENTION_DAYS}-day window`)
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

    return jsonResponse({ purged: purged.length, failed })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error'
    console.error('purge-verification-docs failed', message)
    return jsonResponse({ error: message }, 500)
  }
})
