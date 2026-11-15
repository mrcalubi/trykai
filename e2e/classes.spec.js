import { expect, test } from '@playwright/test'
import { stubAllExternalCalls } from './support/network'
import { LATTE_ART, SIGNED_IN_USER, makeAuthSession, makeMyAccount } from './support/fixtures'

/** The next date from tomorrow on `weekday` (0 Sun … 6 Sat) in Singapore, plus whole weeks. */
function singaporeDate(weekday, weeksAhead = 0) {
  const now = new Date(Date.now() + 8 * 3_600_000)
  for (let i = 1; i < 9; i += 1) {
    const day = new Date(now.getTime() + i * 86_400_000)
    if (day.getUTCDay() === weekday) {
      return new Date(day.getTime() + weeksAhead * 7 * 86_400_000).toISOString().slice(0, 10)
    }
  }
  return null
}

const LISTING = {
  ...LATTE_ART,
  title: 'Flower arranging for beginners',
  host_id: SIGNED_IN_USER.id,
  duration_mins: 90,
  max_guests: 4,
  is_active: true,
  review_status: 'approved',
  users: { display_name: 'Rachel', avatar_url: null, stripe_payouts_enabled: true },
}
const CLASSES = [
  { id: 't-bouquet', listing_id: LISTING.id, name: 'Hand-tied bouquet', description: 'Wrap a bouquet to carry home.', photo_url: null, position: 0, is_active: true },
  { id: 't-table', listing_id: LISTING.id, name: 'Table centrepiece', description: 'A low arrangement in a ceramic bowl.', photo_url: null, position: 1, is_active: true },
]

function session(id, startsAt, typeId) {
  return {
    id,
    listing_id: LISTING.id,
    starts_at: startsAt,
    duration_mins: 90,
    spots_total: 4,
    spots_remaining: 4,
    status: 'open',
    type_id: typeId,
    listings: { title: LISTING.title },
    bookings: [],
  }
}

const SESSIONS = [
  session('s1', `${singaporeDate(6)}T06:00:00Z`, 't-bouquet'),
  session('s2', `${singaporeDate(0)}T02:00:00Z`, 't-table'),
  session('s3', `${singaporeDate(6, 1)}T06:00:00Z`, 't-bouquet'),
  session('s4', `${singaporeDate(0, 1)}T02:00:00Z`, 't-table'),
]

async function stub(page) {
  await stubAllExternalCalls(
    page,
    {
      listings: [LISTING],
      sessions: SESSIONS,
      listing_session_types: CLASSES,
      reviews: [],
      listing_addons: [],
      bookings: [],
      users: [
        { id: SIGNED_IN_USER.id, display_name: 'Kai', avatar_url: null, is_host: true, is_id_verified: true, stripe_payouts_enabled: true },
      ],
      'rpc/my_account': [
        makeMyAccount({ is_host: true, stripe_payouts_enabled: true, verification_status: 'approved' }),
      ],
    },
    { session: makeAuthSession() },
  )
}

test.describe('classes', () => {
  test('the listing page: class cards and one date list share a filter', async ({ page }) => {
    await stub(page)
    await page.goto(`/listings/${LISTING.id}`)

    await expect(page.getByRole('heading', { name: /Pick what you/ })).toBeVisible()
    const rows = page.locator('.class-date')
    await expect(rows).toHaveCount(4)
    await expect(page.locator('.detail-calendar')).toHaveCount(0)

    await page.getByRole('button', { name: 'See Table centrepiece dates' }).click()
    await expect(rows).toHaveCount(2)
    await expect(page.getByRole('group', { name: 'Class' }).getByRole('button', { name: 'Table centrepiece' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    await expect(page.getByRole('button', { name: 'Pick a date' })).toBeDisabled()
    await rows.first().click()
    await expect(page.getByRole('button', { name: /^Book .* · Table centrepiece · / })).toBeEnabled()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      page.viewportSize().width,
    )
  })

  test('Add dates: pick the class, and dates that overlap another class are skipped', async ({ page }) => {
    await stub(page)
    await page.goto('/login')
    await page.getByLabel('Email').fill(SIGNED_IN_USER.email)
    await page.getByLabel('Password', { exact: true }).fill(SIGNED_IN_USER.password)
    await page.getByRole('button', { name: 'Log in' }).click()
    await expect(page).toHaveURL(/\/$/)
    await page.goto('/hosting')

    await page.locator('.hosting-listing-card').getByRole('button', { name: 'Add dates' }).click()
    const sheet = page.getByRole('dialog', { name: 'Add dates' })
    await sheet.locator('.add-dates__class').filter({ hasText: 'Hand-tied bouquet' }).click()
    await expect(sheet.getByRole('heading', { name: 'Adding · Hand-tied bouquet' })).toBeVisible()
    await sheet.getByRole('button', { name: 'Sun', exact: true }).click()
    await sheet.getByRole('button', { name: '2 weeks' }).click()
    await sheet.getByRole('button', { name: '10:00 am' }).click()

    await expect(sheet.getByText('Skipped: Table centrepiece runs then')).toHaveCount(2)
    await expect(sheet.locator('.add-dates__total')).toContainText('2 dates skipped for clashes')
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      page.viewportSize().width,
    )
  })
})
