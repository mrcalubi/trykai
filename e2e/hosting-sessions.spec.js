import { expect, test } from '@playwright/test'
import { stubAllExternalCalls } from './support/network'
import {
  hoursFromNow,
  LATTE_ART,
  SIGNED_IN_USER,
  makeAuthSession,
  makeMyAccount,
} from './support/fixtures'

const LISTING = {
  ...LATTE_ART,
  title: 'Flower arranging for beginners',
  host_id: SIGNED_IN_USER.id,
  duration_mins: 90,
  max_guests: 4,
  is_active: true,
  review_status: 'approved',
}

function session(id, hours, bookings = []) {
  return {
    id,
    listing_id: LISTING.id,
    starts_at: hoursFromNow(hours),
    duration_mins: 90,
    spots_total: 4,
    status: 'open',
    listings: { title: LISTING.title },
    bookings,
  }
}

async function signInToHosting(page) {
  await stubAllExternalCalls(
    page,
    {
      listings: [LISTING],
      sessions: [
        session('session-booked', 24 * 6 + 5, [
          { id: 'booking-1', status: 'confirmed', guests_count: 1, total_amount: 3700 },
        ]),
        session('session-open-1', 24 * 7 + 10),
        session('session-open-2', 24 * 13 + 5),
      ],
      bookings: [{ id: 'booking-1', guest_id: 'guest-1', addon_note: 'Is there parking nearby?' }],
      booking_addons: [
        { id: 'a1', booking_id: 'booking-1', name: 'Premium materials', quantity: 1, unit: 'person', unit_guest_cents: 1200 },
      ],
      reviews: [],
      listing_addons: [],
      users: [
        { id: SIGNED_IN_USER.id, display_name: 'Kai', avatar_url: null, is_host: true, is_id_verified: true, stripe_payouts_enabled: true },
      ],
      'rpc/my_account': [
        makeMyAccount({ is_host: true, stripe_payouts_enabled: true, verification_status: 'approved' }),
      ],
      'rpc/host_session_guests': [
        { session_id: 'session-booked', booking_id: 'booking-1', user_id: 'guest-1', display_name: 'Wei Ling T.', is_companion: false, guests_count: 1 },
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
}

async function expectNoSideScroll(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize().width,
  )
}

test.describe('host session management', () => {
  test('Next up, the dates list, remove with undo, and Select', async ({ page }) => {
    await signInToHosting(page)

    const next = page.locator('.next-up')
    await expect(next).toContainText('Flower arranging for beginners')
    await expect(next).toContainText('Wei Ling T.')
    await expect(next).toContainText('1 of 4 spots booked')
    await expect(next).toContainText('Is there parking nearby?')

    const card = page.locator('.hosting-listing-card')
    await expect(card).toContainText('1 with bookings · 2 open')
    await expect(card.locator('.host-date')).toHaveCount(3)
    await expect(card.getByText('1 of 4 booked')).toBeVisible()
    await expect(card.getByText('Open · 4 spots')).toHaveCount(2)
    await expectNoSideScroll(page)

    // Every row action and header control is easy to tap.
    for (const control of await card
      .locator('.host-date__open, .host-date__menu .ui-overflow__trigger, .host-dates__select, .host-dates__add')
      .all()) {
      expect((await control.boundingBox()).height).toBeGreaterThanOrEqual(44)
    }

    // Remove waits so it can be undone.
    await card.getByRole('button', { name: /^Options for / }).first().click()
    await page.getByRole('menuitem', { name: 'Remove' }).click()
    await expect(card.locator('.host-date')).toHaveCount(2)
    await expect(card.getByRole('button', { name: 'Undo' })).toBeFocused()
    await card.getByRole('button', { name: 'Undo' }).click()
    await expect(card.locator('.host-date')).toHaveCount(3)

    // Select only offers open dates.
    await card.getByRole('button', { name: 'Select' }).click()
    await expect(card.getByRole('checkbox')).toHaveCount(2)
    await card.getByRole('checkbox').first().check()
    await expect(card.getByRole('button', { name: 'Remove 1 date' })).toBeVisible()
    await card.getByRole('button', { name: 'Done' }).click()
    await expect(card.getByRole('checkbox')).toHaveCount(0)
  })

  test('the session page: guests, the fixed time, and the one way out', async ({ page }) => {
    await signInToHosting(page)

    await page.getByRole('link', { name: /View session/ }).click()
    await expect(page).toHaveURL(/session=session-booked/)

    const view = page.locator('.host-session')
    await expect(view.getByText('1 of 4 spots booked')).toBeVisible()
    await expect(
      view.getByText('3 spots still open. Bookings close 3 hours before, as set on this listing.'),
    ).toBeVisible()
    await expect(view.getByText('1 spot · paid · Premium materials')).toBeVisible()
    await expect(view.getByText('Is there parking nearby?')).toBeVisible()
    await expect(view.getByRole('link', { name: 'Add parking and directions to your listing' })).toHaveAttribute(
      'href',
      `/edit-listing/${LISTING.id}?section=location`,
    )
    await expect(view.getByRole('heading', { name: 'This time is fixed now' })).toBeVisible()
    // The header is on screen, not hidden above under the profile card.
    const head = await view.locator('.host-session__head').boundingBox()
    expect(head.y).toBeLessThan(page.viewportSize().height)
    await expectNoSideScroll(page)

    await view.getByRole('button', { name: 'Cancel this session' }).click()
    await expect(view.getByText('Cancelling refunds your guest in full and adds a strike to your account.')).toBeVisible()
    await view.getByRole('button', { name: 'Keep session' }).click()

    await view.getByRole('link', { name: 'Back to Hosting' }).click()
    await expect(page).not.toHaveURL(/session=/)
    await expect(page.locator('.next-up')).toBeVisible()
  })
})
