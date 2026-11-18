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
  test('adds Sat and Sun for 2 weeks at two times as 8 sessions', async ({ page }) => {
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
        listing_addons: [],
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
    const card = page.locator('.hosting-listing-card').filter({ hasText: 'Learn latte art with me' })
    await expect(card).toBeVisible()

    await card.getByRole('button', { name: 'Add dates' }).click()
    const sheet = page.getByRole('dialog', { name: 'Add dates' })
    await expect(sheet).toBeVisible()
    await expect(sheet.getByText('Learn latte art with me · No dates yet')).toBeVisible()
    await expect(sheet.getByText('Each session runs 1 hr. Pick one or more start times.')).toBeVisible()

    await sheet.getByRole('button', { name: 'Sat', exact: true }).click()
    await sheet.getByRole('button', { name: 'Sun', exact: true }).click()
    await sheet.getByRole('button', { name: '2 weeks' }).click()
    await sheet.getByRole('button', { name: '10:00 am' }).click()
    await sheet.getByRole('button', { name: '2:00 pm' }).click()

    // The bar counts as the host picks; the list shows five, then the rest.
    await expect(sheet.locator('.add-dates__total')).toContainText('8 sessions')
    await expect(sheet.locator('.add-dates__total')).toContainText('32 spots for guests to book')
    await expect(sheet.getByRole('button', { name: 'Add 8 sessions' })).toBeVisible()
    await expect(sheet.locator('.add-dates__row-day')).toHaveCount(5)
    await sheet.getByRole('button', { name: 'See all 8' }).click()
    await expect(sheet.locator('.add-dates__row-day')).toHaveCount(8)

    // Dropping one session keeps the date's other time.
    const firstRemove = sheet.getByRole('button', { name: /^Remove / }).first()
    await firstRemove.click()
    await expect(sheet.getByRole('button', { name: 'Add 7 sessions' })).toBeVisible()

    // Pick dates shows the calendar with the picked days.
    await sheet.getByRole('button', { name: 'Pick dates' }).click()
    await expect(sheet.locator('.session-calendar__day--selected').first()).toBeVisible()

    // Every control is easy to tap, the bar stays on screen, nothing runs off a phone.
    for (const control of await sheet.locator('.add-dates__time, .add-dates__seg, .add-dates__remove, .add-dates__close').all()) {
      const box = await control.boundingBox()
      expect(box.height).toBeGreaterThanOrEqual(44)
    }
    const bar = await sheet.locator('.add-dates__bar').boundingBox()
    expect(bar.y + bar.height).toBeLessThanOrEqual(page.viewportSize().height + 1)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      page.viewportSize().width,
    )

    await page.keyboard.press('Escape')
    await expect(sheet).toBeHidden()
    await expect(card.getByRole('button', { name: 'Add dates' })).toBeFocused()
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
      {
        session: makeAuthSession(),
        functions: {
          'lookup-postal-code': {
            results: [{ address: '12 CLAY ROAD SINGAPORE 470012', postal: '470012' }],
            planning_area: 'BEDOK',
          },
        },
      },
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
    await expect(page.getByText('Maximum of 8 photos (1/8)')).toBeVisible()
    await expect(page.getByText('Cover', { exact: true })).toBeVisible()
    await expect(page.getByText('Drag to reorder. The first photo is your cover.')).toBeVisible()
    await page.getByRole('button', { name: 'Photo 1 (cover)' }).click()
    await expect(page.getByRole('menuitem', { name: 'View' })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: 'Crop' })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: 'Make cover' })).toHaveCount(0)
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
    await expect(page.getByText('How much notice do you need?')).toHaveCount(0)

    await page.getByRole('button', { name: 'Add an add-on' }).click()
    await expect(page.getByText('Charged per guest')).toBeVisible()
    await page.getByRole('button', { name: 'Take-home kit' }).click()
    await page.getByLabel('You get in Singapore dollars').fill('15')
    await expect(page.getByText(/^You get S\$15 · guests pay S\$\d+$/)).toBeVisible()
    await page.getByRole('button', { name: 'Done' }).click()
    await expect(page.getByRole('button', { name: 'Edit Take-home kit' })).toBeVisible()
    // The row keeps "You get S$15 per guest" and "guests pay S$17" each on one line.
    await expect(page.locator('.addon-row__meta')).toHaveText(
      /^You\sget\sS\$15\sper\sguest · guests\spay\sS\$\d+$/,
    )
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      page.viewportSize().width,
    )
    await next()

    await expect(page.getByRole('heading', { name: 'Where it happens' })).toBeVisible()
    await page.getByLabel('Postal code').fill('470012')
    await expect(page.getByText('12 CLAY ROAD SINGAPORE 470012')).toBeVisible()
    await expect(page.getByLabel('Area guests see')).toHaveValue('Bedok')
    await next()

    await expect(page.getByRole('heading', { name: 'Final touches' })).toBeVisible()
    await page.getByText('1 day', { exact: true }).click()
    await expect(page.getByText(/the last booking is Friday at 7 pm/)).toBeVisible()
    // All five notice chips sit on one row, even on a phone.
    const chips = page.locator('.booking-cutoff .choice-chip')
    await expect(chips).toHaveCount(5)
    const first = await chips.first().boundingBox()
    const last = await chips.last().boundingBox()
    expect(Math.abs(last.y - first.y)).toBeLessThan(first.height / 2)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      page.viewportSize().width,
    )
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
    // The overview lists every section with what is in it now.
    const sections = page.getByRole('navigation', { name: 'Listing sections' })
    await expect(sections.getByRole('link', { name: /^Price and time/ })).toBeVisible()
    await expect(sections.getByRole('link', { name: /^Location/ })).toContainText('Tiong Bahru')

    await sections.getByRole('link', { name: /^Location/ }).click()
    await expect(page.getByRole('heading', { name: 'Location', level: 2 })).toBeVisible()
    await expect(page.getByText('12 Coffee Road')).toBeVisible()
    await expect(page.getByText('Hidden from guests until they book.')).toBeVisible()

    // Phones show one screen at a time; desktop keeps the list beside the form.
    if (page.viewportSize().width < 1024) {
      await expect(sections).toBeHidden()
      await page.getByRole('link', { name: 'All sections' }).click()
    }
    await sections.getByRole('link', { name: /^Price and time/ }).click()
    await expect(page.getByLabel('Spots per session')).toHaveText('6')
    await expect(page.getByLabel('Your price per guest')).toHaveValue('45')

    // Nothing in the section runs off a phone screen.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      page.viewportSize().width,
    )

    await page.getByRole('button', { name: 'Fewer spots' }).click()
    await page.getByRole('button', { name: 'Fewer spots' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Unsaved changes' })).toBeVisible()

    // On a 320px phone the status sits above the buttons, not under them.
    const size = page.viewportSize()
    await page.setViewportSize({ width: 320, height: 640 })
    const status = await page.locator('.edit-savebar__status').boundingBox()
    const actions = await page.locator('.edit-savebar__actions').boundingBox()
    expect(status.y + status.height).toBeLessThanOrEqual(actions.y + 1)
    expect(actions.x + actions.width).toBeLessThanOrEqual(320)
    await page.setViewportSize(size)

    await page.getByRole('button', { name: 'Save changes' }).click()

    // Saving keeps the host on the section, with a note of what changed.
    await expect(page.getByText(/Saved\. Updated 1 future session/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save changes' })).toBeDisabled()

    await page.goto('/hosting')
    await page.getByRole('button', { name: 'Add dates' }).click()
    await page.getByRole('button', { name: 'Sat', exact: true }).click()
    await page.getByRole('button', { name: '10:00 am' }).click()
    await expect(page.getByText('16 spots for guests to book')).toBeVisible()

    await page.goto(`/listings/${listing.id}`)
    await expect(page.getByText(/4 spots left/)).toBeVisible()
  })
})
