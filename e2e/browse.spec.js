import { expect, test } from '@playwright/test'
import { stubAllExternalCalls } from './support/network'
import { BOXING, LATTE_ART } from './support/fixtures'

test.describe('browsing listings', () => {
  test('shows the hero and every active listing', async ({ page }) => {
    await stubAllExternalCalls(page, { listings: [LATTE_ART, BOXING] })
    await page.goto('/')

    await expect(page.getByRole('heading', { name: /Singapore's not boring/ })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Learn latte art with me' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Boxing basics' })).toBeVisible()
  })

  test('shows the host, area and price on each card', async ({ page }) => {
    await stubAllExternalCalls(page, { listings: [LATTE_ART] })
    await page.goto('/')

    await expect(page.getByText('Mei Ling · Tiong Bahru · $45/person')).toBeVisible()
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
