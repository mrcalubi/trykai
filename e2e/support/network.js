/**
 * Network stubs for the end-to-end suite.
 *
 * These tests exercise the real production bundle, router and Supabase client,
 * but every outbound request is answered inside the browser. That keeps the suite
 * hermetic: no Supabase project, no Stripe account, no test data to reset, and no
 * flakiness from a third party being slow.
 */

export const SUPABASE_URL = 'https://e2e.supabase.co'

function tableName(url) {
  return new URL(url).pathname.replace('/rest/v1/', '')
}

/** PostgREST returns a bare object instead of an array when `.single()` is used. */
function wantsSingleRow(request) {
  return (request.headers().accept ?? '').includes('vnd.pgrst.object')
}

function json(route, body, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(body),
  })
}

/**
 * Answers every Supabase REST read with the rows supplied per table.
 *
 * @param page    Playwright page
 * @param tables  map of table name to the rows that table should return
 * @param session session the password grant should hand back, or null to reject it
 * @param functions map of Edge Function name to a JSON body or a (requestBody) => body
 */
export async function stubSupabase(page, tables = {}, { session = null, functions = {} } = {}) {
  await page.route(`${SUPABASE_URL}/**`, async (route) => {
    const request = route.request()

    if (request.method() === 'OPTIONS') {
      return route.fulfill({
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Allow-Methods': '*',
        },
      })
    }

    if (request.url().includes('/auth/v1/')) {
      return session
        ? json(route, session)
        : json(route, { error: 'invalid_grant', error_description: 'Invalid login credentials' }, 400)
    }

    if (request.url().includes('/functions/v1/')) {
      const name = new URL(request.url()).pathname.replace(/^\/functions\/v1\//, '')
      const payload = functions[name]
      if (payload === undefined) return json(route, {})
      if (typeof payload === 'function') {
        let body = {}
        try {
          body = request.postDataJSON() ?? {}
        } catch {
          body = {}
        }
        return json(route, payload(body))
      }
      return json(route, payload)
    }

    if (!request.url().includes('/rest/v1/')) {
      return json(route, {})
    }

    const rows = tables[tableName(request.url())] ?? []

    if (wantsSingleRow(request)) {
      return rows.length === 0
        ? json(
            route,
            {
              code: 'PGRST116',
              message: 'JSON object requested, multiple (or no) rows returned',
            },
            406
          )
        : json(route, rows[0])
    }

    return json(route, rows)
  })
}

/** Stripe's loader is fetched from its CDN at import time; it is never exercised here. */
export async function stubStripe(page) {
  await page.route('https://js.stripe.com/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: 'window.Stripe = function () { return { elements: function () { return {} } } }',
    })
  )
}

export async function stubAllExternalCalls(page, tables, options) {
  await stubStripe(page)
  await stubSupabase(page, tables, options)
}
