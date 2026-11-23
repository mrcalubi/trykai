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

// A three-figure price and an odd length: the longest price row a card can get.
const PRICEY = [0, 1].map((i) => ({
  ...LATTE_ART,
  id: `pricey-${i}`,
  title: `Pricey session ${i}`,
  price_per_person: 12197,
  duration_mins: 200,
}))

// A typical card: S$51 for 1.5 hr.
const TYPICAL = { ...LATTE_ART, id: 'typical', title: 'Typical session', duration_mins: 90 }

async function openLocation(page) {
  await page.getByRole('button', { name: /Anywhere/ }).click()
}

test.describe('browsing listings', () => {
  test('never scrolls sideways on a 320px phone, however many filters show', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 })
    await stubAllExternalCalls(page, {
      listings: [TYPICAL, ...PRICEY, ...ONE_PER_CATEGORY, ...WEST_FILLERS, LATTE_ART, BOXING],
    })
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.locator('.trust-list__item').first()).toBeVisible()
    await expect(page.locator('.ui-card__length').first()).toBeVisible()
    // Measure with the web fonts in, not the fallback the page paints first.
    await page.evaluate(() => document.fonts.ready)

    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
    // The trust pills scroll inside their own row instead.
    const row = await page.locator('.trust-list').boundingBox()
    expect(row.x + row.width).toBeLessThanOrEqual(320)
    // Even the longest price row stays inside its card, with the tag on the price's line
    // ("/person" drops under the price instead). This holds whatever the font metrics.
    for (const card of await page.locator('.listings-grid > a').all()) {
      const tag = card.locator('.ui-card__length')
      if ((await tag.count()) === 0) continue
      const box = await card.boundingBox()
      const tagBox = await tag.boundingBox()
      const amount = await card.locator('.ui-card__amount').boundingBox()
      expect(tagBox.x + tagBox.width).toBeLessThanOrEqual(box.x + box.width + 0.5)
      expect(Math.abs(tagBox.y + tagBox.height / 2 - (amount.y + amount.height / 2))).toBeLessThan(1)
    }
  })

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
    await expect(card.locator('.ui-card__amount')).toHaveText('S$51')
    await expect(card.locator('.ui-card__unit')).toHaveText('/person')
    await expect(card).not.toContainText('★')
  })

  test('lines the price rows up across a grid row, with the length in a tag on the right', async ({
    page,
  }, testInfo) => {
    await stubAllExternalCalls(page, {
      listings: [
        { ...LATTE_ART, duration_mins: 90 },
        {
          ...BOXING,
          title: 'Boxing basics for absolute beginners who have never thrown a single punch',
          duration_mins: 60,
        },
      ],
      'rpc/listing_ratings': [{ listing_id: LATTE_ART.id, average: 5, review_count: 1 }],
    })
    await page.goto('/')

    const latte = page.getByRole('link', { name: /Learn latte art with me/ })
    const boxing = page.getByRole('link', { name: /Boxing basics/ })
    await expect(latte.locator('.ui-card__price-row')).toHaveText('S$51/person1.5 hr')
    await expect(boxing.locator('.ui-card__length')).toHaveText('1 hr')
    // Measure with the web fonts in, not the fallback the page paints first.
    await page.evaluate(() => document.fonts.ready)

    // A two-line title does not push one card's price row below its neighbour's.
    const latteRow = await latte.locator('.ui-card__price-row').boundingBox()
    const boxingRow = await boxing.locator('.ui-card__price-row').boundingBox()
    expect(Math.abs(latteRow.y - boxingRow.y)).toBeLessThan(1)

    // The tag is right-aligned on the same line as the price, with "/person" beside the price.
    for (const card of [latte, boxing]) {
      const box = await card.boundingBox()
      const amount = await card.locator('.ui-card__amount').boundingBox()
      const unit = await card.locator('.ui-card__unit').boundingBox()
      const tag = await card.locator('.ui-card__length').boundingBox()
      expect(Math.abs(tag.x + tag.width - (box.x + box.width))).toBeLessThan(1)
      expect(Math.abs(tag.y + tag.height / 2 - (amount.y + amount.height / 2))).toBeLessThan(1)
      expect(unit.x).toBeGreaterThan(amount.x + amount.width)
    }

    // On a phone the rating gets its own line; wider cards keep it beside the area.
    const area = await latte.locator('.ui-card__meta-inline').boundingBox()
    const rating = await latte.locator('.ui-card__rating').boundingBox()
    if (testInfo.project.name === 'mobile-chrome') {
      expect(rating.y).toBeGreaterThanOrEqual(area.y + area.height - 1)
      expect(Math.abs(rating.x - area.x)).toBeLessThan(1)
    } else {
      expect(Math.abs(rating.y - area.y)).toBeLessThan(3)
      expect(rating.x).toBeGreaterThan(area.x + area.width)
    }
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
    // LATTE_ART S$45 → S$51 all in, BOXING S$30 → S$34: the chip shows the lowest.
    await expect(page.getByText('Sessions from $34')).toBeAttached()
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
