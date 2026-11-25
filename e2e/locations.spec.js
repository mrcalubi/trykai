import { expect, test } from '@playwright/test'
import { stubAllExternalCalls } from './support/network'
import { LATTE_ART, SIGNED_IN_USER, hoursFromNow, makeAuthSession, makeMyAccount } from './support/fixtures'

// A team listing (00059): the same Saturday time at two places, each its own session.
const LISTING = {
  ...LATTE_ART,
  id: 'listing-team',
  title: 'Pottery with the studio team',
  area: 'Tampines',
  duration_mins: 90,
  max_guests: 4,
  is_active: true,
  review_status: 'approved',
  booking_cutoff_hours: 3,
}

const PLACES = [
  { id: 'loc-t', listing_id: LISTING.id, label: null, area: 'Tampines', position: 0, is_active: true },
  { id: 'loc-j', listing_id: LISTING.id, label: 'Jurong studio', area: 'Jurong East', position: 1, is_active: true },
]

const startsAt = hoursFromNow(72)

function session(id, locationId, spots) {
  return {
    id,
    listing_id: LISTING.id,
    starts_at: startsAt,
    duration_mins: 90,
    spots_total: 4,
    spots_remaining: spots,
    status: 'open',
    type_id: null,
    location_id: locationId,
  }
}

const SESSIONS = [session('s-t', 'loc-t', 3), session('s-j', 'loc-j', 4)]

async function stub(page, tables = {}) {
  await stubAllExternalCalls(page, {
    listings: [{ ...LISTING, sessions: SESSIONS }],
    sessions: SESSIONS,
    listing_locations: PLACES,
    listing_session_types: [],
    listing_addons: [],
    reviews: [],
    users: [{ id: LISTING.host_id, is_id_verified: true }],
    ...tables,
  })
}

test.describe('listing locations, for guests', () => {
  test('the listing page names each place and filters dates by place', async ({ page }, testInfo) => {
    await stub(page)
    await page.goto(`/listings/${LISTING.id}`)

    await expect(page.locator('.detail-area')).toHaveText('Tampines + 1 more')
    const whereField = page.getByRole('button', { name: /^Where:/ })
    await expect(whereField).toHaveAccessibleName('Where: Any place · Tampines or Jurong East')
    await expect(page.getByText('Same price at every place.')).toHaveCount(1)
    await expect(page.locator('.session-card__place')).toHaveText(['Tampines', 'Jurong studio · Jurong East'])

    await whereField.click()
    const list = page.getByRole('dialog', { name: 'Where' })
    await expect(list.getByRole('button', { name: /^Any place/ })).toContainText('2 dates')
    await expect(list.getByRole('button', { name: /^Jurong studio/ })).toContainText('Jurong East · 1 date · next')
    for (const option of await list.getByRole('button').all()) {
      expect((await option.boundingBox()).height).toBeGreaterThanOrEqual(40)
    }
    if (testInfo.project.name === 'mobile-chrome') {
      // On phones the list is a sheet from the bottom.
      const box = await list.boundingBox()
      expect(Math.round(box.y + box.height)).toBeGreaterThanOrEqual(page.viewportSize().height - 2)
    }
    await page.screenshot({ path: testInfo.outputPath('listing-locations-picker.png') })
    await list.getByRole('button', { name: /^Jurong studio/ }).click()
    await expect(list).toHaveCount(0)
    await expect(whereField).toHaveAccessibleName('Where: Jurong studio, Jurong East')
    // A picked place isn't repeated on its times.
    await expect(page.locator('.session-card__place')).toHaveCount(0)
    await expect(page.locator('.session-card')).toHaveCount(1)

    const where = page.locator('.detail-section').filter({ has: page.getByRole('heading', { name: /Where you.ll be/ }) })
    await expect(where.getByText('Mei runs this with a team, so your teacher may be a team member.')).toBeVisible()
    await expect(where.locator('.detail-location__title')).toHaveText(['Tampines, Singapore', 'Jurong studio'])
    await expect(where.getByRole('button', { name: 'Showing dates at Jurong studio · Jurong East' })).toBeVisible()
    await expect(where).not.toContainText('Blk')

    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      page.viewportSize().width,
    )
    await page.screenshot({ path: testInfo.outputPath('listing-locations.png'), fullPage: true })
  })

  test('opens on one place from a shared link', async ({ page }) => {
    await stub(page)
    await page.goto(`/listings/${LISTING.id}?location=loc-t`)
    await expect(page.getByRole('button', { name: 'Where: Tampines' })).toBeVisible()
    await expect(page.locator('.session-card')).toHaveCount(1)
    await expect(page.locator('.session-card__place')).toHaveCount(0)
  })

  test('a one-location listing looks as before', async ({ page }) => {
    await stub(page, { listing_locations: [PLACES[0]], sessions: [session('s-t', 'loc-t', 3)] })
    await page.goto(`/listings/${LISTING.id}`)
    await expect(page.locator('.detail-area')).toHaveText('Tampines')
    await expect(page.getByRole('button', { name: /^Where:/ })).toHaveCount(0)
    await expect(page.locator('.session-card__place')).toHaveCount(0)
  })

  test('browse cards count the other places', async ({ page }) => {
    await stub(page)
    await page.goto('/')
    await expect(page.getByRole('link', { name: /Pottery with the studio team/ })).toContainText('Tampines +1')
  })
})

test.describe('listing locations, for the host', () => {
  test('Next up shows each place running at that time', async ({ page }, testInfo) => {
    const mine = { ...LISTING, host_id: SIGNED_IN_USER.id, multi_location: true }
    const booked = (id, locationId, guests) => ({
      ...session(id, locationId, 4 - guests),
      spots_total: 4,
      listings: { title: mine.title },
      bookings: [{ id: `b-${id}`, status: 'confirmed', guests_count: guests, total_amount: 3700 * guests }],
    })
    await stubAllExternalCalls(
      page,
      {
        listings: [mine],
        sessions: [booked('s-j', 'loc-j', 1), booked('s-t', 'loc-t', 2)],
        listing_locations: PLACES,
        bookings: [
          { id: 'b-s-t', guest_id: 'guest-1', addon_note: null },
          { id: 'b-s-j', guest_id: 'guest-2', addon_note: 'Is there a lift?' },
        ],
        booking_addons: [],
        listing_addons: [],
        listing_session_types: [],
        reviews: [],
        users: [
          { id: SIGNED_IN_USER.id, display_name: 'Kai', avatar_url: null, is_host: true, is_id_verified: true, stripe_payouts_enabled: true },
        ],
        'rpc/my_account': [
          makeMyAccount({ is_host: true, stripe_payouts_enabled: true, verification_status: 'approved' }),
        ],
        'rpc/host_session_guests': [
          { session_id: 's-t', booking_id: 'b-s-t', user_id: 'guest-1', display_name: 'Wei Ling T.', is_companion: false, guests_count: 2 },
          { session_id: 's-j', booking_id: 'b-s-j', user_id: 'guest-2', display_name: 'Arjun', is_companion: false, guests_count: 1 },
        ],
      },
      { session: makeAuthSession() },
    )
    await page.goto('/login')
    await page.getByLabel('Email').fill(SIGNED_IN_USER.email)
    await page.getByLabel('Password', { exact: true }).fill(SIGNED_IN_USER.password)
    await page.getByRole('button', { name: 'Log in' }).click()
    await expect(page).toHaveURL(/\/$/)
    await page.goto('/hosting')

    const next = page.locator('.next-up')
    const rows = next.locator('.next-up__place-row')
    await expect(rows).toHaveCount(2)
    await expect(rows.nth(0)).toContainText('Tampines')
    await expect(rows.nth(0)).toContainText('2 of 4 spots booked')
    await expect(rows.nth(1)).toContainText('Jurong studio · Jurong East')
    await expect(rows.nth(1)).toContainText('Is there a lift?')
    for (const link of await next.getByRole('link', { name: /^View session at / }).all()) {
      expect((await link.boundingBox()).height).toBeGreaterThanOrEqual(44)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      page.viewportSize().width,
    )
    await next.screenshot({ path: testInfo.outputPath('next-up-places.png') })

    await next.getByRole('link', { name: 'View session at Jurong studio · Jurong East' }).click()
    await expect(page).toHaveURL(/session=s-j/)
  })
})
