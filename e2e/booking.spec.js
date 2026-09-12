import { expect, test } from '@playwright/test'
import { stubAllExternalCalls } from './support/network'
import { LATTE_ART, OPEN_SESSION, SOLD_OUT_SESSION } from './support/fixtures'

test.describe('listing detail', () => {
  test('shows the host, price, description and what is provided', async ({ page }) => {
    await stubAllExternalCalls(page, {
      listings: [LATTE_ART],
      sessions: [OPEN_SESSION],
      reviews: [],
    })
    await page.goto('/listings/listing-latte')

    await expect(page.getByText('Hosted by Mei Ling')).toBeVisible()
    await expect(page.getByText('$51').first()).toBeVisible()
    await expect(page.getByText('No reviews yet', { exact: true })).toBeVisible()
    await expect(page.getByText('Pull your first rosetta in ninety minutes.')).toBeVisible()
    await expect(page.getByRole('listitem').filter({ hasText: 'Materials' })).toBeVisible()
  })

  test('lists a bookable session with its remaining spots', async ({ page }) => {
    await stubAllExternalCalls(page, {
      listings: [LATTE_ART],
      sessions: [OPEN_SESSION],
      reviews: [],
    })
    await page.goto('/listings/listing-latte')

    await expect(page.getByText(/90 mins · 3 spots left/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Book' })).toBeEnabled()
  })

  test('will not let a sold-out session be booked', async ({ page }) => {
    await stubAllExternalCalls(page, {
      listings: [LATTE_ART],
      sessions: [SOLD_OUT_SESSION],
      reviews: [],
    })
    await page.goto('/listings/listing-latte')

    await expect(page.getByRole('button', { name: 'Book' })).toBeDisabled()
  })

  test('says when there is nothing available to book', async ({ page }) => {
    await stubAllExternalCalls(page, { listings: [LATTE_ART], sessions: [], reviews: [] })
    await page.goto('/listings/listing-latte')

    await expect(page.getByText('No upcoming sessions available.')).toBeVisible()
  })

  test('reveals the cancellation policy on request', async ({ page }) => {
    await stubAllExternalCalls(page, { listings: [LATTE_ART], sessions: [], reviews: [] })
    await page.goto('/listings/listing-latte')

    await expect(page.getByText('Guest cancels 48+ hours before session:')).toBeHidden()
    await page.getByRole('button', { name: /Cancellation Policy/ }).click()

    await expect(page.getByText('Guest cancels 48+ hours before session:')).toBeVisible()
    await expect(page.getByText('Guest cancels 24–48 hours before session:')).toBeVisible()
    await expect(page.getByText('Guest cancels 6–24 hours before session:')).toBeVisible()
    await expect(
      page.getByText('Guest cancels under 6 hours before session, or does not show up:')
    ).toBeVisible()
  })

  test('shows a helpful message for a listing that does not exist', async ({ page }) => {
    await stubAllExternalCalls(page, { listings: [] })
    await page.goto('/listings/does-not-exist')

    await expect(page.getByRole('link', { name: /Back to browse/ })).toBeVisible()
  })
})

test.describe('booking requires an account', () => {
  test('sends a signed-out visitor to log in', async ({ page }) => {
    await stubAllExternalCalls(page, {
      listings: [LATTE_ART],
      sessions: [OPEN_SESSION],
      reviews: [],
    })
    await page.goto('/listings/listing-latte')

    await page.getByRole('button', { name: 'Book' }).click()

    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
  })

  test('never asks for a payment intent before the visitor signs in', async ({ page }) => {
    const functionCalls = []
    page.on('request', (request) => {
      if (request.url().includes('/functions/v1/')) functionCalls.push(request.url())
    })
    await stubAllExternalCalls(page, {
      listings: [LATTE_ART],
      sessions: [OPEN_SESSION],
      reviews: [],
    })
    await page.goto('/listings/listing-latte')

    await page.getByRole('button', { name: 'Book' }).click()
    await expect(page).toHaveURL(/\/login$/)

    expect(functionCalls).toEqual([])
  })
})
