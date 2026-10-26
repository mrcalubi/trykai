import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import ReviewCard from './ReviewCard'
import { makeReview } from '../test/fixtures'

function renderReview(overrides) {
  return render(<ReviewCard review={makeReview(overrides)} />)
}

describe('ReviewCard', () => {
  it('shows the reviewer display name from the RPC jsonb and their initial', () => {
    renderReview({ users: { full_name: 'Latte Queen' } })
    expect(screen.getByText('Latte Queen')).toBeInTheDocument()
    expect(document.querySelector('.review-card__avatar')).toHaveTextContent('L')
  })

  it('shows a review photo only when the payload already has avatar_url', () => {
    renderReview({
      users: { full_name: 'Latte Queen', avatar_url: 'https://cdn.test/latte.jpg' },
    })
    expect(document.querySelector('.review-card__avatar')).toHaveAttribute(
      'src',
      'https://cdn.test/latte.jpg',
    )
    expect(screen.queryByText('L')).not.toBeInTheDocument()
  })

  it('renders the listing title when the review is on a host profile', () => {
    renderReview({ listing_title: 'Learn latte art with me' })
    expect(screen.getByText('Learn latte art with me')).toBeInTheDocument()
  })

  it('omits the listing title on listing-page reviews', () => {
    const { container } = renderReview()
    expect(container.querySelector('.review-card__listing')).not.toBeInTheDocument()
  })

  it('falls back to "Guest" when the reviewer has no name', () => {
    renderReview({ users: null })
    expect(screen.getByText('Guest')).toBeInTheDocument()
    expect(document.querySelector('.review-card__avatar')).toHaveTextContent('?')
  })

  it('exposes the rating to assistive technology', () => {
    renderReview({ rating: 4 })
    expect(screen.getByLabelText('4 out of 5 stars')).toBeInTheDocument()
  })

  it('fills exactly as many stars as the rating', () => {
    const { container } = renderReview({ rating: 3 })
    expect(container.querySelectorAll('.star-display__filled')).toHaveLength(3)
    expect(container.querySelectorAll('.star-display__empty')).toHaveLength(2)
  })

  it('renders the comment when there is one', () => {
    renderReview({ comment: 'Learned so much, thank you.' })
    expect(screen.getByText('Learned so much, thank you.')).toBeInTheDocument()
  })

  it('omits the comment paragraph for a rating-only review', () => {
    const { container } = renderReview({ comment: null })
    expect(container.querySelector('.review-card__comment')).not.toBeInTheDocument()
  })

  it('keeps Report review inside a ⋮ menu', async () => {
    const user = userEvent.setup()
    renderReview({ id: 'review-9', listing_title: 'Latte art' })

    expect(screen.queryByRole('link', { name: /Report/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Report review' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'More actions' }))
    const report = screen.getByRole('menuitem', { name: 'Report review' })
    expect(decodeURIComponent(report.getAttribute('href'))).toContain('Report: review on Latte art')
    expect(decodeURIComponent(report.getAttribute('href'))).toContain('review-9')
    expect(decodeURIComponent(report.getAttribute('href'))).toContain("Tell us what's wrong:")
  })

  it('hides the report menu on your own review', () => {
    render(
      <ReviewCard
        review={makeReview({ id: 'review-9', reviewer_id: 'user-1' })}
        viewerId="user-1"
      />
    )
    expect(screen.queryByRole('button', { name: 'More actions' })).not.toBeInTheDocument()
  })

  it('renders the date in Singapore time', () => {
    renderReview({ created_at: '2026-03-14T02:00:00.000Z' })
    expect(screen.getByText(/14 Mar 2026/)).toBeInTheDocument()
  })

  it('rolls the date forward for timestamps that fall on the next Singapore day', () => {
    // 17:00 UTC is 01:00 the following morning in Asia/Singapore.
    renderReview({ created_at: '2026-03-14T17:00:00.000Z' })
    expect(screen.getByText(/15 Mar 2026/)).toBeInTheDocument()
  })
})
