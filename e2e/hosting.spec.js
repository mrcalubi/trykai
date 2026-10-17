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
