/**
 * Official TryKai accounts. Clean URLs, no tracking params.
 *
 * Duplicated as TRYKAI_SOCIALS in supabase/functions/_shared/email.ts because
 * Edge Functions cannot import the Vite src/ tree. socials.test.js keeps the
 * two copies in lockstep.
 */
export const TRYKAI_SOCIALS = {
  instagram: 'https://www.instagram.com/trykaisg/',
  tiktok: 'https://www.tiktok.com/@trykaisg',
}
