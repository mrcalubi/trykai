import { expect, test } from '@playwright/test'
import { stubAllExternalCalls } from './support/network'
import { BOXING, LATTE_ART } from './support/fixtures'

test.describe('browsing listings', () => {
  test('shows the landing headline above the grid of every active listing', async ({ page }) => {
    await stubAllExternalCalls(page, { listings: [LATTE_ART, BOXING] })
    await page.goto('/')

    await expect(
      page.getByRole('heading', {
        level: 1,
        name: "Singapore's not boring. You just haven't found your thing yet.",
      })
    ).toBeVisible()
    await expect(page.getByText(/Solo, with friends, or on a date/)).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Learn latte art with me' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Boxing basics' })).toBeVisible()
  })

  test('shows the category and price on each card, with no rating until it has one', async ({
    page,
  }) => {
    await stubAllExternalCalls(page, { listings: [LATTE_ART] })
    await page.goto('/')

    const card = page.getByRole('link', { name: /Learn latte art with me/ })
    await expect(card.getByText('Food')).toBeVisible()
    await expect(card.getByText('$51/person')).toBeVisible()
    await expect(card).not.toContainText('★')
  })

  test('lays the grid out two across on a phone', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-chrome', 'phone viewport only')
    await stubAllExternalCalls(page, { listings: [LATTE_ART, BOXING] })
    await page.goto('/')

    const cards = page.locator('.listings-grid > a')
    await expect(cards).toHaveCount(2)
    const first = await cards.nth(0).boundingBox()
    const second = await cards.nth(1).boundingBox()

    expect(second.y).toBe(first.y)
    expect(second.x).toBeGreaterThan(first.x)
  })

  test('filters by category', async ({ page }) => {
    await stubAllExternalCalls(page, { listings: [LATTE_ART, BOXING] })
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Boxing basics' })).toBeVisible()

    await page.getByRole('button', { name: 'Fitness', exact: true }).click()

    await expect(page.getByRole('heading', { name: 'Boxing basics' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Learn latte art with me' })).toBeHidden()
  })

  test('filters by area', async ({ page }) => {
    await stubAllExternalCalls(page, { listings: [LATTE_ART, BOXING] })
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Boxing basics' })).toBeVisible()

    await page.getByLabel('Filter by area').selectOption('Bedok')

    await expect(page.getByRole('heading', { name: 'Boxing basics' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Learn latte art with me' })).toBeHidden()
  })

  test('explains an empty filter result', async ({ page }) => {
    await stubAllExternalCalls(page, { listings: [LATTE_ART, BOXING] })
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Boxing basics' })).toBeVisible()

    await page.getByRole('button', { name: 'Food', exact: true }).click()
    await page.getByLabel('Filter by area').selectOption('Bedok')

    await expect(page.getByText('No listings match your filters.')).toBeVisible()
  })

  test('invites the visitor back when there is nothing listed', async ({ page }) => {
    await stubAllExternalCalls(page, { listings: [] })
    await page.goto('/')

    await expect(page.getByText('No listings yet. Check back soon.')).toBeVisible()
  })

  test('opens a listing from the grid', async ({ page }) => {
    await stubAllExternalCalls(page, {
      listings: [LATTE_ART],
      sessions: [],
      reviews: [],
    })
    await page.goto('/')

    await page.getByRole('link', { name: /Learn latte art with me/ }).click()

    await expect(page).toHaveURL(/\/listings\/listing-latte$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Learn latte art with me' })).toBeVisible()
  })
})
