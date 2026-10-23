/**
 * Listing review on the host's side (00036). A new listing is hidden from
 * guests until the TryKai team approves it; the host can carry on adding
 * dates in the meantime.
 */
import { supabase } from './supabase'

export { listingReviewBadge } from '../../supabase/functions/_shared/listingReview.ts'

/**
 * Tells the TryKai team a listing is waiting, straight after a save. Never
 * awaited by the page and never throws: the team also sees every waiting
 * listing on /admin/listings, and the next save retries.
 */
export async function notifyListingSubmitted() {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    await supabase.functions.invoke('listing-submitted', {
      body: {},
      headers: { Authorization: `Bearer ${session?.access_token}` },
    })
  } catch {
    // Best effort; see above.
  }
}
