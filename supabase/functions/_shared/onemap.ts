const TOKEN_URL = 'https://www.onemap.gov.sg/api/auth/post/getToken'
const SEARCH_URL = 'https://www.onemap.gov.sg/api/common/elastic/search'
export const PLANNING_AREA_URL = 'https://www.onemap.gov.sg/api/public/popapi/getPlanningarea'

export const POSTAL_LOOKUP_LIMIT = 20
export const POSTAL_LOOKUP_WINDOW_MS = 10 * 60 * 1000
export const POSTAL_LOOKUP_LIMIT_MESSAGE =
  "You've looked up too many addresses. Please wait a few minutes and try again."
const TOKEN_SKEW_MS = 5 * 60 * 1000
const TOKEN_FALLBACK_SECS = 3 * 24 * 60 * 60

export type OneMapToken = {
  access_token: string
  expiryTimestamp: number
}

export type OneMapSearchHit = {
  ADDRESS: string
  POSTAL: string
  BLK_NO?: string
  ROAD_NAME?: string
  BUILDING?: string
  LATITUDE?: string
  LONGITUDE?: string
}

export function isValidPostal(value: string): boolean {
  return /^\d{6}$/.test(String(value ?? '').trim())
}

export function composeFullAddress(address: string, unit?: string): string {
  const line = String(address ?? '').trim()
  const extra = String(unit ?? '').trim()
  if (!line) return ''
  if (!extra) return line
  if (line.includes(' SINGAPORE ')) return line.replace(' SINGAPORE ', ` ${extra} SINGAPORE `)
  return `${line} ${extra}`
}

export function publicSearchHits(results: OneMapSearchHit[]) {
  return results
    .filter((row) => typeof row?.ADDRESS === 'string' && row.ADDRESS.trim())
    .map((row) => ({
      address: row.ADDRESS.trim(),
      postal: String(row.POSTAL ?? '').trim(),
      building: row.BUILDING && row.BUILDING !== 'NIL' ? row.BUILDING : '',
    }))
}

export function isCachedTokenFresh(
  expiryTimestamp: number,
  nowMs = Date.now(),
  skewMs = TOKEN_SKEW_MS,
): boolean {
  return Number(expiryTimestamp) * 1000 - skewMs > nowMs
}

export function allowPostalLookup(
  hits: Map<string, number[]>,
  userId: string,
  now = Date.now(),
): boolean {
  const id = String(userId ?? '').trim()
  if (!id) return false
  const windowStart = now - POSTAL_LOOKUP_WINDOW_MS
  const recent = (hits.get(id) ?? []).filter((stamp) => stamp > windowStart)
  if (recent.length >= POSTAL_LOOKUP_LIMIT) {
    hits.set(id, recent)
    return false
  }
  recent.push(now)
  hits.set(id, recent)
  return true
}

export function hasBearerJwt(header: string | null): boolean {
  return /^Bearer\s+\S+/i.test(String(header ?? '').trim())
}

export async function oneMapAccessToken(
  fetchImpl: typeof fetch,
  email: string,
  password: string,
): Promise<OneMapToken> {
  const response = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const body = (await response.json().catch(() => ({}))) as {
    access_token?: string
    expiry_timestamp?: string | number
  }
  if (!response.ok || !body.access_token) {
    throw new Error('Could not get a OneMap token')
  }
  const expiry = Number(body.expiry_timestamp)
  return {
    access_token: body.access_token,
    expiryTimestamp: Number.isFinite(expiry)
      ? expiry
      : Math.floor(Date.now() / 1000) + TOKEN_FALLBACK_SECS,
  }
}

export async function searchOneMapPostal(
  fetchImpl: typeof fetch,
  token: string,
  postal: string,
): Promise<OneMapSearchHit[]> {
  const url = `${SEARCH_URL}?searchVal=${encodeURIComponent(postal)}&returnGeom=Y&getAddrDetails=Y&pageNum=1`
  const response = await fetchImpl(url, { headers: { Authorization: token } })
  const body = (await response.json().catch(() => ({}))) as {
    error?: string
    results?: OneMapSearchHit[]
  }
  if (body.error) throw new Error(body.error)
  if (!response.ok) throw new Error('OneMap search failed')
  return Array.isArray(body.results) ? body.results : []
}

export function firstSearchCoords(
  results: OneMapSearchHit[],
): { latitude: number; longitude: number } | null {
  for (const row of results) {
    const latitude = Number(row?.LATITUDE)
    const longitude = Number(row?.LONGITUDE)
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      return { latitude, longitude }
    }
  }
  return null
}

/** OneMap returns `[{ pln_area_n, geojson }]`; anything else is ignored. */
export function planningAreaNameFromOneMap(payload: unknown): string | null {
  if (!Array.isArray(payload) || payload.length === 0) return null
  const name = (payload[0] as { pln_area_n?: unknown })?.pln_area_n
  return typeof name === 'string' && name.trim() ? name.trim() : null
}

export async function oneMapPlanningArea(
  fetchImpl: typeof fetch,
  token: string,
  latitude: number,
  longitude: number,
): Promise<string | null> {
  const url = `${PLANNING_AREA_URL}?latitude=${encodeURIComponent(String(latitude))}&longitude=${encodeURIComponent(String(longitude))}&year=2019`
  const response = await fetchImpl(url, { headers: { Authorization: token } })
  const body = await response.json().catch(() => null)
  if (!response.ok) return null
  return planningAreaNameFromOneMap(body)
}
