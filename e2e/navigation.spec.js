import { expect, test } from '@playwright/test'
import { stubAllExternalCalls } from './support/network'
import { LATTE_ART, SIGNED_IN_USER, makeAuthSession } from './support/fixtures'

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

    await expect(page.getByRole('link', { name: 'Log in', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Create listing' })).toBeHidden()
    await expect(page.getByRole('link', { name: 'My bookings' })).toBeHidden()
  })

  test('opens the login page from the top nav', async ({ page }) => {
    await stubAllExternalCalls(page, { listings: [LATTE_ART] })
    await page.goto('/')

    await page.getByRole('link', { name: 'Log in', exact: true }).click()

    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
  })

  // The published terms have to be reachable from the nav while signed out, not
  // only from the footer. Both places link the same routes, so this has to be
  // scoped to the menu or it binds to the footer link of the same name.
  test('reaches the policy pages from the hamburger menu', async ({ page }) => {
    await stubAllExternalCalls(page, { listings: [LATTE_ART] })
    await page.goto('/')

    await page.getByRole('button', { name: 'Open menu' }).click()
    const menu = page.getByRole('navigation', { name: 'Main menu' })

    await expect(menu.getByRole('link', { name: 'Refund policy' })).toBeVisible()
    await expect(menu.getByRole('link', { name: 'Dispute policy' })).toBeVisible()
    await menu.getByRole('link', { name: 'Cancellation policy' }).click()

    await expect(page).toHaveURL(/\/cancellation-policy$/)
    await expect(
      page.getByRole('heading', { level: 1, name: 'Cancellation Policy' })
    ).toBeVisible()
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

  test('redirects verification review to login', async ({ page }) => {
    await stubAllExternalCalls(page, {})
    await page.goto('/admin/verifications')

    await expect(page).toHaveURL(/\/login$/)
  })

  test('returns the visitor to where they were headed after logging in', async ({ page }) => {
    await stubAllExternalCalls(
      page,
      { users: [{ id: SIGNED_IN_USER.id, verification_status: 'approved' }] },
      { session: makeAuthSession() }
    )
    await page.goto('/create-listing')
    await expect(page).toHaveURL(/\/login$/)

    await page.getByLabel('Email').fill(SIGNED_IN_USER.email)
    await page.getByLabel('Password').fill(SIGNED_IN_USER.password)
    await page.getByRole('button', { name: 'Log in' }).click()

    // The whole point of stashing the destination: the visitor lands back on the
    // form they asked for, not on the home page.
    await expect(page).toHaveURL(/\/create-listing$/)
    await expect(page.getByLabel('Title')).toBeVisible()
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

test.describe('verification review', () => {
  test('an admin opens the queue from the menu and sees both documents', async ({ page }) => {
    await stubAllExternalCalls(
      page,
      {
        users: [{ id: SIGNED_IN_USER.id, full_name: 'Caleb', avatar_url: null }],
        'rpc/my_verification': [{ is_admin: true }],
      },
      {
        session: makeAuthSession(),
        functions: {
          'admin-verifications': (body) => {
            if (body?.action === 'list') {
              return {
                pending: [
                  {
                    id: 'host-9',
                    full_name: 'Mei Ling',
                    email: 'mei@example.com',
                    submitted_at: '2026-09-01T02:00:00.000Z',
                    id_photo_url: '/trykai.png',
                    selfie_url: '/trykai.png',
                  },
                ],
              }
            }
            return { ok: true }
          },
        },
      }
    )

    await page.goto('/login')
    await page.getByLabel('Email').fill(SIGNED_IN_USER.email)
    await page.getByLabel('Password').fill(SIGNED_IN_USER.password)
    await page.getByRole('button', { name: 'Log in' }).click()
    await expect(page).toHaveURL(/\/$/)

    await page.getByRole('button', { name: 'Open menu' }).click()
    await page
      .getByRole('navigation', { name: 'Main menu' })
      .getByRole('link', { name: 'Verification review' })
      .click()

    await expect(page).toHaveURL(/\/admin\/verifications$/)
    await expect(page.getByRole('heading', { name: 'Verification review' })).toBeVisible()
    await expect(page.getByText('Mei Ling')).toBeVisible()
    await expect(page.getByAltText('ID document')).toBeVisible()
    await expect(page.getByAltText('Selfie')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Approve' })).toBeVisible()
  })
})

