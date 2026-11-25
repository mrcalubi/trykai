import { expect, test } from '@playwright/test'
import { stubAllExternalCalls } from './support/network'
import { LATTE_ART, hoursFromNow } from './support/fixtures'

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
    const chips = page.getByRole('group', { name: 'Location' })
    await expect(chips.getByRole('button', { name: 'All locations' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('.session-card__place')).toHaveText(['Tampines', 'Jurong studio · Jurong East'])

    await chips.getByRole('button', { name: 'Jurong studio · Jurong East' }).click()
    await expect(page.locator('.session-card__place')).toHaveText(['Jurong studio · Jurong East'])
    await expect(page.locator('.session-card')).toHaveCount(1)

    const where = page.locator('.detail-section').filter({ has: page.getByRole('heading', { name: /Where you.ll be/ }) })
    await expect(where.getByText('Mei runs this with a team, so your teacher may be a team member.')).toBeVisible()
    await expect(where.locator('.detail-location__title')).toHaveText(['Tampines, Singapore', 'Jurong studio, Jurong East'])
    await expect(where).not.toContainText('Blk')

    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      page.viewportSize().width,
    )
    await page.screenshot({ path: testInfo.outputPath('listing-locations.png'), fullPage: true })
  })

  test('opens on one place from a shared link', async ({ page }) => {
    await stub(page)
    await page.goto(`/listings/${LISTING.id}?location=loc-t`)
    await expect(
      page.getByRole('group', { name: 'Location' }).getByRole('button', { name: 'Tampines' }),
    ).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('.session-card__place')).toHaveText(['Tampines'])
  })

  test('a one-location listing looks as before', async ({ page }) => {
    await stub(page, { listing_locations: [PLACES[0]], sessions: [session('s-t', 'loc-t', 3)] })
    await page.goto(`/listings/${LISTING.id}`)
    await expect(page.locator('.detail-area')).toHaveText('Tampines')
    await expect(page.getByRole('group', { name: 'Location' })).toHaveCount(0)
    await expect(page.locator('.session-card__place')).toHaveCount(0)
  })

  test('browse cards count the other places', async ({ page }) => {
    await stub(page)
    await page.goto('/')
    await expect(page.getByRole('link', { name: /Pottery with the studio team/ })).toContainText('Tampines +1')
  })
})
