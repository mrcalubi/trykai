import { expect, test } from '@playwright/test'
import { stubAllExternalCalls } from './support/network'
import { LATTE_ART, OPEN_SESSION, hoursFromNow } from './support/fixtures'

const HOST = {
  id: 'host-1',
  display_name: 'Mei',
  bio: 'I pull rosettas.',
  avatar_url: null,
  is_host: true,
  is_id_verified: true,
  stripe_payouts_enabled: true,
  banner_preset: 'coral',
  banner_url: null,
  featured_review_id: null,
  instagram_handle: 'mei.cooks',
  tiktok_handle: null,
}

const REVIEW = {
  id: 'review-1',
  rating: 5,
  comment: 'Mei made it so relaxed.',
  created_at: '2026-10-01T02:00:00.000Z',
  listing_title: LATTE_ART.title,
  users: { full_name: 'Sam' },
}

test.describe('public profile v2', () => {
  test('shows the card, the featured review and what is coming up', async ({ page }) => {
    await stubAllExternalCalls(page, {
      users: [HOST],
      listings: [LATTE_ART],
      sessions: [OPEN_SESSION, { ...OPEN_SESSION, id: 'session-3', starts_at: hoursFromNow(100) }],
      reviews: [{ id: 'review-1', reviewer_id: 'guest-1' }],
      'rpc/reviews_for_host': [REVIEW],
      'rpc/host_sessions_held': [3],
      'rpc/host_is_founding': [true],
      'rpc/listing_ratings': [],
    })

    await page.goto('/u/host-1')

    await expect(page.getByRole('heading', { name: 'Mei', level: 1 })).toBeVisible()
    await expect(page.getByText('Founding host')).toBeVisible()
    await expect(page.getByText('ID verified')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Instagram: mei.cooks' })).toHaveAttribute(
      'href',
      'https://www.instagram.com/mei.cooks/',
    )
    await expect(page.getByTestId('profile-stats')).toContainText('Sessions held')
    await expect(page.getByRole('region', { name: 'What guests say' })).toContainText(
      'Mei made it so relaxed.',
    )
    const comingUp = page.getByRole('region', { name: 'Coming up' })
    await expect(comingUp.getByRole('link')).toHaveCount(2)
    await expect(comingUp.getByRole('link').first()).toHaveAttribute('href', `/listings/${LATTE_ART.id}`)
    await expect(page.getByRole('heading', { name: 'Sessions by Mei' })).toBeVisible()
    await expect(page.getByText('Only you see these')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Milestones' })).toHaveCount(0)

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })
})
