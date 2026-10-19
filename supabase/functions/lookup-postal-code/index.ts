import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { jsonResponse, textResponse } from '../_shared/http.ts'
import {
  POSTAL_LOOKUP_LIMIT_MESSAGE,
  allowPostalLookup,
  hasBearerJwt,
  isCachedTokenFresh,
  isValidPostal,
  oneMapAccessToken,
  publicSearchHits,
  searchOneMapPostal,
} from '../_shared/onemap.ts'

let cachedToken = ''
let cachedExpiry = 0
const lookupHits = new Map<string, number[]>()

async function token(): Promise<string> {
  if (cachedToken && isCachedTokenFresh(cachedExpiry)) return cachedToken
  const email = Deno.env.get('ONEMAP_EMAIL') ?? ''
  const password = Deno.env.get('ONEMAP_PASSWORD') ?? ''
  if (!email || !password) throw new Error('OneMap is not configured')
  const next = await oneMapAccessToken(fetch, email, password)
  cachedToken = next.access_token
  cachedExpiry = next.expiryTimestamp
  return cachedToken
}

function clearToken() {
  cachedToken = ''
  cachedExpiry = 0
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return textResponse('ok')
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  try {
    const authHeader = req.headers.get('Authorization')
    if (!hasBearerJwt(authHeader)) return jsonResponse({ error: 'Unauthorized' }, 401)

    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader ?? '' } } },
    )
    const {
      data: { user },
    } = await supabaseAuth.auth.getUser()
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401)

    if (!allowPostalLookup(lookupHits, user.id)) {
      return jsonResponse({ error: POSTAL_LOOKUP_LIMIT_MESSAGE, results: [] }, 429)
    }

    const body = (await req.json().catch(() => ({}))) as { postal?: string }
    const postal = String(body.postal ?? '').trim()
    if (!isValidPostal(postal)) {
      return jsonResponse({ error: 'Enter a 6-digit postal code.', results: [] }, 400)
    }

    let access = await token()
    try {
      const results = publicSearchHits(await searchOneMapPostal(fetch, access, postal))
      if (results.length === 0) {
        return jsonResponse({ error: 'No address matches that postal code.', results: [] }, 404)
      }
      return jsonResponse({ results })
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      if (!message.toLowerCase().includes('token')) throw error
      clearToken()
      access = await token()
      const results = publicSearchHits(await searchOneMapPostal(fetch, access, postal))
      if (results.length === 0) {
        return jsonResponse({ error: 'No address matches that postal code.', results: [] }, 404)
      }
      return jsonResponse({ results })
    }
  } catch {
    console.error('lookup-postal-code failed')
    return jsonResponse({ error: 'Could not look up that postal code.' }, 500)
  }
})
