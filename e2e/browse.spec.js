import { expect, test } from '@playwright/test'
import { stubAllExternalCalls } from './support/network'
import { BOXING, LATTE_ART, hoursFromNow } from './support/fixtures'

// The location filter only appears from 8 listings across 2+ regions.
// These sit in the West with no sessions, so East filters never show them.
const WEST_FILLERS = Array.from({ length: 6 }, (_, i) => ({
  ...BOXING,
  id: `west-${i}`,
  title: `West filler ${i}`,
  category: 'Other',
  area: 'Jurong West',
  price_per_person: 9000,
  sessions: [],
}))

const ONE_PER_CATEGORY = ['Food', 'Fitness', 'Arts', 'Music', 'Language', 'Other'].map((category, i) => ({
  ...LATTE_ART,
  id: `cat-${i}`,
  title: `${category} session`,
  category,
}))

async function openLocation(page) {
  await page.getByRole('button', { name: /Anywhere/ }).click()
}

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

  test('lists the listing with the soonest session first', async ({ page }) => {
    const latteNextWeek = {
      ...LATTE_ART,
      sessions: [{ starts_at: hoursFromNow(24 * 7), status: 'open' }],
    }
    const boxingTomorrow = {
      ...BOXING,
      sessions: [{ starts_at: hoursFromNow(24), status: 'open' }],
    }
    await stubAllExternalCalls(page, { listings: [latteNextWeek, boxingTomorrow] })
    await page.goto('/')

    await expect(page.locator('.listings-grid h3')).toHaveText([
      'Boxing basics',
      'Learn latte art with me',
    ])
  })

  test('shows only categories that have listings, and the value pill', async ({ page }) => {
    await stubAllExternalCalls(page, { listings: [LATTE_ART, BOXING] })
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Boxing basics' })).toBeVisible()

    await expect(page.getByRole('button', { name: 'Fitness', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Music', exact: true })).toHaveCount(0)
    await expect(page.getByText('Most sessions under S$30')).toBeAttached()
  })

  test('on a phone, a half category tab peeks so the row reads as swipeable', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-chrome', 'phone viewport only')
    await stubAllExternalCalls(page, { listings: ONE_PER_CATEGORY })
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Food session' })).toBeVisible()

    const bar = page.locator('.category-bar')
    const viewport = page.viewportSize().width
    const tabs = await bar.locator('.category-tab').evaluateAll((els) =>
      els.map((el) => {
        const box = el.getBoundingClientRect()
        return { left: box.left, right: box.right }
      })
    )
    expect(tabs).toHaveLength(7)
    // One tab straddles the right edge: started on screen, ends off it.
    const straddling = tabs.filter((tab) => tab.left < viewport && tab.right > viewport)
    expect(straddling).toHaveLength(1)
    const visible = (viewport - straddling[0].left) / (straddling[0].right - straddling[0].left)
    expect(visible).toBeGreaterThan(0.4)
    expect(visible).toBeLessThan(0.6)
  })

  test('keeps the filters to one row', async ({ page }) => {
    const weekendCheap = { ...LATTE_ART, id: 'cheap', title: 'Cheap and soon', price_per_person: 1500 }
    await stubAllExternalCalls(page, { listings: [weekendCheap, BOXING, ...WEST_FILLERS] })
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Boxing basics' })).toBeVisible()

    const chips = await page.locator('.filter-strip > .chip').evaluateAll((els) =>
      els.map((el) => Math.round(el.getBoundingClientRect().top))
    )
    expect(chips.length).toBeGreaterThanOrEqual(2)
    expect(new Set(chips).size).toBe(1)
  })

  test('keeps the first listing cards on screen at 1280x800', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'desktop fold only')
    await page.setViewportSize({ width: 1280, height: 800 })
    await stubAllExternalCalls(page, { listings: [LATTE_ART, BOXING] })
    await page.goto('/')

    const card = page.getByRole('link', { name: /Learn latte art with me/ })
    await expect(card).toBeVisible()
    const box = await card.boundingBox()
    expect(box).toBeTruthy()
    expect(box.y).toBeLessThan(720)
    expect(box.y + 80).toBeLessThan(800)
  })

  test('region select uses the shared chevron', async ({ page }) => {
    await stubAllExternalCalls(page, { listings: [LATTE_ART, BOXING, ...WEST_FILLERS] })
    await page.goto('/')
    await openLocation(page)
    const select = page.getByLabel('Filter by region')
    await expect(select).toBeVisible()
    const style = await select.evaluate((el) => {
      const computed = getComputedStyle(el)
      return {
        appearance: computed.appearance,
        paddingRight: computed.paddingRight,
        backgroundImage: computed.backgroundImage,
      }
    })
    expect(style.appearance).toBe('none')
    expect(parseFloat(style.paddingRight)).toBeGreaterThanOrEqual(36)
    expect(style.backgroundImage).toContain('data:image/svg+xml')
  })

  test('filters by category', async ({ page }) => {
    await stubAllExternalCalls(page, { listings: [LATTE_ART, BOXING] })
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Boxing basics' })).toBeVisible()

    await page.getByRole('button', { name: 'Fitness', exact: true }).click()

    await expect(page.getByRole('heading', { name: 'Boxing basics' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Learn latte art with me' })).toBeHidden()
  })

  test('filters by a neighbourhood alias', async ({ page }) => {
    await stubAllExternalCalls(page, { listings: [LATTE_ART, BOXING, ...WEST_FILLERS] })
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Boxing basics' })).toBeVisible()
    await openLocation(page)

    await page.getByLabel('Filter by area').fill('Kembangan')
    await page.getByRole('option', { name: 'Bedok (Kembangan)' }).click()

    await expect(page.getByRole('heading', { name: 'Boxing basics' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Learn latte art with me' })).toBeHidden()
  })

  test('filters by region', async ({ page }) => {
    await stubAllExternalCalls(page, { listings: [LATTE_ART, BOXING, ...WEST_FILLERS] })
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Boxing basics' })).toBeVisible()
    await openLocation(page)

    await page.getByLabel('Filter by region').selectOption('East')

    await expect(page.getByRole('heading', { name: 'Boxing basics' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Learn latte art with me' })).toBeHidden()
  })

  test('explains an empty filter result', async ({ page }) => {
    await stubAllExternalCalls(page, { listings: [LATTE_ART, BOXING, ...WEST_FILLERS] })
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Boxing basics' })).toBeVisible()

    await page.getByRole('button', { name: 'Food', exact: true }).click()
    await openLocation(page)
    await page.getByLabel('Filter by region').selectOption('East')

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

  test('going back from a listing keeps the card you opened on screen', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-chrome', 'phone viewport only')
    await stubAllExternalCalls(page, {
      listings: [LATTE_ART, BOXING, ...WEST_FILLERS],
      sessions: [],
      reviews: [],
    })
    await page.goto('/')

    const card = page.getByRole('link', { name: /West filler 5/ })
    await card.scrollIntoViewIfNeeded()
    await expect(card).toBeInViewport()
    await card.click()
    await expect(page).toHaveURL(/\/listings\/west-5$/)

    await page.goBack()
    await expect(page).toHaveURL(/\/(?:\?.*)?$/)
    await expect(card).toBeInViewport()
  })

  test('the logo opens a fresh unfiltered browse page at the top', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-chrome', 'phone viewport only')
    await stubAllExternalCalls(page, {
      listings: [LATTE_ART, BOXING, ...WEST_FILLERS],
      sessions: [],
      reviews: [],
    })
    await page.goto('/')
    await page.getByRole('button', { name: 'Food', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Food', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await page.evaluate(() => window.scrollTo(0, 400))

    await page.getByRole('link', { name: /Learn latte art with me/ }).click()
    await expect(page).toHaveURL(/\/listings\/listing-latte$/)

    await page.getByRole('link', { name: 'TryKai home' }).click()
    await expect(page).toHaveURL('/')
    await expect(page.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true')
    expect(await page.evaluate(() => window.scrollY)).toBe(0)
  })
})
