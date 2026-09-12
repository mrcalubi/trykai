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

/** Inline so the gallery never waits on a real photo host. */
function fakePhoto(hue) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="450"><rect width="600" height="450" fill="hsl(${hue} 50% 60%)"/></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

function withPhotos(count) {
  return {
    ...LATTE_ART,
    photo_urls: [20, 200, 320, 90, 45].slice(0, count).map(fakePhoto),
  }
}

test.describe('listing detail gallery', () => {
  test('swipes on a phone and moves the position indicator', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-chrome', 'phone gallery only')
    await stubAllExternalCalls(page, {
      listings: [withPhotos(3)],
      sessions: [OPEN_SESSION],
      reviews: [],
    })
    await page.goto('/listings/listing-latte')

    const dots = page.locator('.detail-gallery__dot')
    await expect(dots).toHaveCount(3)
    await expect(dots.nth(0)).toHaveClass(/--active/)

    const scroller = page.locator('.detail-gallery__scroller')
    await scroller.evaluate((el) => el.scrollBy({ left: el.clientWidth, behavior: 'instant' }))

    await expect(dots.nth(1)).toHaveClass(/--active/)
    await expect(dots.nth(0)).not.toHaveClass(/--active/)
  })

  test('stacks one photo per screen on a phone', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-chrome', 'phone gallery only')
    await stubAllExternalCalls(page, {
      listings: [withPhotos(2)],
      sessions: [OPEN_SESSION],
      reviews: [],
    })
    await page.goto('/listings/listing-latte')

    const scroller = await page.locator('.detail-gallery__scroller').boundingBox()
    const first = await page.locator('.detail-gallery__photo').first().boundingBox()

    expect(Math.round(first.width)).toBe(Math.round(scroller.width))
    // 4/3, so the second photo is off to the side rather than stacked below.
    expect(Math.round(first.height)).toBe(Math.round((first.width * 3) / 4))
  })

  for (const count of [1, 2, 3, 4, 5]) {
    test(`fits all ${count} photos inside the capped desktop mosaic`, async ({
      page,
    }, testInfo) => {
      test.skip(testInfo.project.name !== 'chromium', 'desktop mosaic only')
      await stubAllExternalCalls(page, {
        listings: [withPhotos(count)],
        sessions: [OPEN_SESSION],
        reviews: [],
      })
      await page.goto('/listings/listing-latte')

      const photos = page.locator('.detail-gallery__photo')
      await expect(photos).toHaveCount(count)

      const gallery = await page.locator('.detail-gallery__scroller').boundingBox()
      expect(gallery.height).toBeLessThanOrEqual(440)

      // A photo taller than its track used to overflow and get clipped.
      for (let i = 0; i < count; i += 1) {
        const photo = await photos.nth(i).boundingBox()
        expect(photo.height).toBeGreaterThan(0)
        expect(photo.y).toBeGreaterThanOrEqual(gallery.y - 1)
        expect(photo.y + photo.height).toBeLessThanOrEqual(gallery.y + gallery.height + 1)
      }
    })
  }

  test('keeps a single photo narrower than the page on desktop', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'desktop mosaic only')
    await stubAllExternalCalls(page, {
      listings: [withPhotos(1)],
      sessions: [OPEN_SESSION],
      reviews: [],
    })
    await page.goto('/listings/listing-latte')

    const gallery = await page.locator('.detail-gallery__scroller').boundingBox()
    const content = await page.locator('.detail-layout').boundingBox()

    expect(gallery.width).toBeLessThan(content.width * 0.75)
    // The title has to survive above the fold next to the booking card.
    await expect(page.getByRole('heading', { level: 1 })).toBeInViewport()
    await expect(page.locator('.detail-booking-card__price')).toBeInViewport()
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
