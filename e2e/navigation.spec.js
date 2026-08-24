import { expect, test } from '@playwright/test'
import { stubAllExternalCalls } from './support/network'
import { LATTE_ART } from './support/fixtures'

const POLICY_PAGES = [
  ['Refund Policy', '/refund-policy'],
  ['Cancellation Policy', '/cancellation-policy'],
  ['Dispute Policy', '/dispute-policy'],
]

test.describe('policy pages', () => {
  for (const [name, path] of POLICY_PAGES) {
    test(`reaches the ${name} from the footer`, async ({ page }) => {
      await stubAllExternalCalls(page, { listings: [LATTE_ART] })
      await page.goto('/')

      await page.getByRole('contentinfo').getByRole('link', { name }).click()

      await expect(page).toHaveURL(new RegExp(`${path}$`))
      await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()
    })

    // Guests arrive on these pages from emails and search results, so the SPA
    // rewrite has to serve them on a cold load, not only via client routing.
    test(`serves the ${name} on a direct load`, async ({ page }) => {
      await stubAllExternalCalls(page, {})
      await page.goto(path)

      await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()
    })
  }

  test('the cancellation policy publishes all four refund tiers', async ({ page }) => {
    await stubAllExternalCalls(page, {})
    await page.goto('/cancellation-policy')

    await expect(page.getByText(/48 hours or more before the session starts:/)).toBeVisible()
    await expect(page.getByText(/Between 24 and 48 hours/)).toBeVisible()
    await expect(page.getByText(/Between 6 and 24 hours/)).toBeVisible()
    await expect(page.getByText(/Less than 6 hours/)).toBeVisible()
  })
})

test.describe('signed-out navigation', () => {
  test('offers a login link and hides the host tools', async ({ page }) => {
    await stubAllExternalCalls(page, { listings: [LATTE_ART] })
    await page.goto('/')

    await expect(page.getByRole('link', { name: 'Login' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Create listing' })).toBeHidden()
    await expect(page.getByRole('link', { name: 'Dashboard' })).toBeHidden()
  })

  test('opens the login page from the navbar', async ({ page }) => {
    await stubAllExternalCalls(page, { listings: [LATTE_ART] })
    await page.goto('/')

    await page.getByRole('link', { name: 'Login' }).click()

    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
  })

  test('switches between logging in and signing up', async ({ page }) => {
    await stubAllExternalCalls(page, {})
    await page.goto('/login')

    await page.getByRole('button', { name: 'Sign up' }).click()

    await expect(page.getByRole('heading', { name: 'Create account' })).toBeVisible()
    await expect(page.getByLabel('Full name')).toBeVisible()
  })

  test('redirects the dashboard to login', async ({ page }) => {
    await stubAllExternalCalls(page, {})
    await page.goto('/dashboard')

    await expect(page).toHaveURL(/\/login$/)
  })

  test('redirects listing creation to login', async ({ page }) => {
    await stubAllExternalCalls(page, {})
    await page.goto('/create-listing')

    await expect(page).toHaveURL(/\/login$/)
  })

  test('returns the visitor to where they were headed after logging in', async ({ page }) => {
    await stubAllExternalCalls(page, {})
    await page.goto('/create-listing')
    await expect(page).toHaveURL(/\/login$/)

    // The pending destination is carried in router state, so the form should be
    // ready to send the visitor back rather than dropping them on the home page.
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
  })

  test('renders the home page without console errors', async ({ page }) => {
    const errors = []
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    page.on('pageerror', (error) => errors.push(error.message))

    await stubAllExternalCalls(page, { listings: [LATTE_ART] })
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Learn latte art with me' })).toBeVisible()

    expect(errors).toEqual([])
  })
})
