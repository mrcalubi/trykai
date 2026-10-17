import { expect, test } from '@playwright/test'
import { stubAllExternalCalls } from './support/network'
import { LATTE_ART, SIGNED_IN_USER, makeAuthSession } from './support/fixtures'

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
            is_active: true,
          },
        ],
        sessions: [],
        reviews: [],
        users: [
          {
            id: SIGNED_IN_USER.id,
            full_name: 'Kai Host',
            display_name: 'Kai',
            avatar_url: null,
            is_host: true,
            stripe_payouts_enabled: true,
          },
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
    await page.getByLabel('Spots total').fill('4')

    const selected = page.locator('.session-calendar__day--selected')
    await expect(selected).toHaveCount(4)

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
            full_name: 'Kai Host',
            display_name: 'Kai',
            avatar_url: null,
            is_host: true,
            verification_status: 'approved',
            stripe_payouts_enabled: true,
          },
        ],
        'rpc/my_verification': [{ verification_status: 'approved', is_admin: false }],
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
    await expect(page.getByRole('heading', { name: 'Create a listing' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Identity verified' })).toHaveCount(0)

    await page.getByLabel('Title').fill('Weekend pottery')
    await page.getByLabel('Description').fill('Throw a bowl on the wheel.')
    await page.getByLabel('Category').selectOption('Arts')
    await page.getByLabel('Price per person (SGD)').fill('40')
    await page.getByLabel('Max guests').fill('6')
    await page.getByLabel('Duration (mins)').fill('90')
    await page.getByLabel('Area').fill('Bedok')
    await page.getByRole('option', { name: 'Bedok' }).click()
    await page.getByLabel(/^Full address/).fill('12 Clay Road')
    await page.getByRole('checkbox', { name: /I agree to the Host terms/ }).check()
    await page.getByRole('button', { name: 'Create listing' }).click()

    await expect(page).toHaveURL(new RegExp(`/u/${SIGNED_IN_USER.id}\\?tab=hosting`))
  })
})
