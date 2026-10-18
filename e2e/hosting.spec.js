import { expect, test } from '@playwright/test'
import { stubAllExternalCalls } from './support/network'
import {
  hoursFromNow,
  LATTE_ART,
  SIGNED_IN_USER,
  makeAuthSession,
  makeMyAccount,
} from './support/fixtures'

test.describe('host add sessions', () => {
  test('quick-fills Sat and Sun for 2 weeks at two times into 8 sessions', async ({ page }) => {
    await stubAllExternalCalls(
      page,
      {
        listings: [
          {
            ...LATTE_ART,
            host_id: SIGNED_IN_USER.id,
            duration_mins: 60,
            max_guests: 4,
            is_active: true,
          },
        ],
        sessions: [],
        reviews: [],
        users: [
          {
            id: SIGNED_IN_USER.id,
            display_name: 'Kai',
            avatar_url: null,
            is_host: true,
            is_id_verified: true,
            stripe_payouts_enabled: true,
          },
        ],
        'rpc/my_account': [
          makeMyAccount({
            is_host: true,
            stripe_payouts_enabled: true,
            verification_status: 'approved',
          }),
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
    await expect(page).toHaveURL(new RegExp(`/u/${SIGNED_IN_USER.id}\\?tab=hosting`))
    await expect(page.getByText('Learn latte art with me')).toBeVisible()

    await page.getByRole('button', { name: 'Add session' }).click()
    await page.getByRole('button', { name: 'Sat', exact: true }).click()
    await page.getByRole('button', { name: 'Sun', exact: true }).click()
    await page.getByLabel('Time', { exact: true }).fill('10:00')
    await page.getByRole('button', { name: '+ add time' }).click()
    await page.getByLabel('Time 2').fill('14:00')
    await expect(page.getByText('4 spots per session ·')).toBeVisible()
    await expect(page.getByRole('link', { name: 'change in listing settings' })).toHaveAttribute(
      'href',
      `/edit-listing/${LATTE_ART.id}`,
    )
    await expect(page.getByLabel('Spots total')).toHaveCount(0)

    // Count every picked date, not the highlighted days: from a Saturday, the
    // fourth date falls in next month and is off the calendar on screen.
    await expect(page.getByText(/^4 dates selected\./)).toBeVisible()

    await page.getByRole('button', { name: 'Review sessions' }).click()
    await expect(page.getByText('This creates 8 sessions.')).toBeVisible()
    await expect(page.locator('.add-sessions__preview-list li')).toHaveCount(8)
  })
})

test.describe('verified host create listing', () => {
  test('Host a session from the menu lands on create listing and can submit', async ({ page }) => {
    await stubAllExternalCalls(
      page,
      {
        listings: [
          {
            ...LATTE_ART,
            host_id: SIGNED_IN_USER.id,
            is_active: true,
          },
        ],
        sessions: [],
        reviews: [],
        users: [
          {
            id: SIGNED_IN_USER.id,
            display_name: 'Kai',
            avatar_url: null,
            is_host: true,
            is_id_verified: true,
            stripe_payouts_enabled: true,
          },
        ],
        'rpc/my_account': [
          makeMyAccount({
            is_host: true,
            stripe_payouts_enabled: true,
            verification_status: 'approved',
          }),
        ],
        'rpc/my_verification': [{ verification_status: 'approved', is_admin: false }],
        'rpc/my_is_founding_host': false,
      },
      { session: makeAuthSession() },
    )

    await page.goto('/login')
    await page.getByLabel('Email').fill(SIGNED_IN_USER.email)
    await page.getByLabel('Password', { exact: true }).fill(SIGNED_IN_USER.password)
    await page.getByRole('button', { name: 'Log in' }).click()
    await expect(page).toHaveURL(/\/$/)

    await page.getByRole('button', { name: 'Open menu' }).click()
    await page.getByRole('navigation', { name: 'Main menu' }).getByRole('link', { name: 'Host a session' }).click()
    await expect(page).toHaveURL(/\/create-listing$/)
    await expect(page.getByRole('heading', { name: 'The basics' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Identity verified' })).toHaveCount(0)

    const next = () => page.getByRole('button', { name: 'Continue' }).click()

    await page.getByLabel('Title').fill('Weekend pottery')
    await page.getByText('Arts', { exact: true }).click()
    await page.getByLabel('Description').fill('Throw a bowl on the wheel.')
    await next()

    await expect(page.getByRole('heading', { name: 'Add photos' })).toBeVisible()
    await page.getByLabel('Photos').setInputFiles('src/assets/categories/food.png')
    await expect(page.getByText('Maximum of 5 photos (1/5)')).toBeVisible()
    await expect(page.getByText('Cover', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Crop' })).toBeVisible()
    await next()

    await expect(page.getByRole('heading', { name: 'Price and group size' })).toBeVisible()
    await expect(page.getByText('Step 3 of 5')).toBeVisible()
    await page.getByLabel('Your price per guest').fill('40')
    await page.getByRole('button', { name: 'More guests' }).click()
    await page.getByRole('button', { name: 'More guests' }).click()
    await page.getByText('1.5 hr', { exact: true }).click()
    await expect(page.getByText('Guests pay')).toBeVisible()
    await expect(page.getByText('You get')).toBeVisible()
    await expect(page.getByText(/Full session of 6/)).toBeVisible()
    await expect(page.getByText('10% host fee from your 4th booking.')).toBeVisible()
    await next()

    await expect(page.getByRole('heading', { name: 'Where it happens' })).toBeVisible()
    await page.getByLabel('Area').fill('Bedok')
    await page.getByRole('option', { name: 'Bedok' }).click()
    await page.getByLabel(/^Full address/).fill('12 Clay Road')
    await next()

    await expect(page.getByRole('heading', { name: 'Final touches' })).toBeVisible()
    await page.getByRole('checkbox', { name: /I agree to the Host terms/ }).check()
    await page.getByRole('button', { name: 'Create listing' }).click()

    await expect(page).toHaveURL(new RegExp(`/u/${SIGNED_IN_USER.id}\\?tab=hosting`))
  })
})

test.describe('listing spots', () => {
  test('changing spots per session from 6 to 4 updates future sessions', async ({ page }) => {
    const listing = {
      ...LATTE_ART,
      host_id: SIGNED_IN_USER.id,
      max_guests: 6,
      duration_mins: 90,
      group_pricing: true,
      is_active: true,
      full_address: '12 Coffee Road',
      photo_urls: ['https://cdn.test/one.jpg'],
    }
    const session = {
      id: 'session-future',
      listing_id: listing.id,
      starts_at: hoursFromNow(48),
      duration_mins: 90,
      spots_total: 6,
      spots_remaining: 6,
      status: 'open',
      listings: { title: listing.title },
      bookings: [],
    }
    const tables = {
      listings: [listing],
      sessions: [session],
      reviews: [],
      users: [
        {
          id: SIGNED_IN_USER.id,
          display_name: 'Kai',
          avatar_url: null,
          is_host: true,
          is_id_verified: true,
          stripe_payouts_enabled: true,
        },
      ],
      'rpc/my_account': [
        makeMyAccount({
          is_host: true,
          stripe_payouts_enabled: true,
          verification_status: 'approved',
        }),
      ],
      'rpc/my_is_founding_host': false,
      'rpc/listing_address': '12 Coffee Road',
      get 'rpc/set_listing_spots'() {
        listing.max_guests = 4
        session.spots_total = 4
        session.spots_remaining = 4
        return { updated: 1, held: [] }
      },
    }

    await stubAllExternalCalls(page, tables, { session: makeAuthSession() })

    await page.goto('/login')
    await page.getByLabel('Email').fill(SIGNED_IN_USER.email)
    await page.getByLabel('Password', { exact: true }).fill(SIGNED_IN_USER.password)
    await page.getByRole('button', { name: 'Log in' }).click()
    await expect(page).toHaveURL(/\/$/)

    await page.goto(`/edit-listing/${listing.id}`)
    await expect(page.getByLabel(/^Full address/)).toHaveValue('12 Coffee Road')
    await expect(page.getByLabel('Spots per session')).toHaveValue('6')
    await page.getByLabel('Spots per session').fill('4')
    await page.getByRole('button', { name: 'Save changes' }).click()

    await expect(page).toHaveURL(new RegExp(`/u/${SIGNED_IN_USER.id}\\?tab=hosting`))
    await expect(page.getByText(/Updated 1 future session/)).toBeVisible()

    await page.getByRole('button', { name: 'Add session' }).click()
    await expect(page.getByText('4 spots per session ·')).toBeVisible()

    await page.goto(`/listings/${listing.id}`)
    await expect(page.getByText(/4 spots left/)).toBeVisible()
  })
})
