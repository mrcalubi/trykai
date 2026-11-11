import { fireEvent, render as rtlRender, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ReviewCard from './ReviewCard'
import { makeReview } from '../test/fixtures'
import { supabase } from '../lib/supabase'

vi.mock('../lib/supabase')

const render = (ui) => rtlRender(ui, { wrapper: MemoryRouter })

function renderReview(overrides) {
  return render(<ReviewCard review={makeReview(overrides)} />)
}

describe('ReviewCard', () => {
  it('links the reviewer photo and name to their profile', () => {
    renderReview({ reviewer_id: 'user-42' })
    expect(screen.getByRole('link', { name: /./ })).toHaveAttribute('href', '/u/user-42')
  })

  it('shows a plain name when the reviewer is unknown', () => {
    renderReview({ reviewer_id: null })
    expect(screen.queryByRole('link', { name: /./ })).not.toBeInTheDocument()
  })

  beforeEach(() => {
    supabase.__reset()
  })

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

  it('hides stars on a host review of a guest', () => {
    render(<ReviewCard review={makeReview({ rating: 5, comment: 'Lovely guest' })} hideRating />)
    expect(screen.queryByLabelText(/out of 5 stars/)).not.toBeInTheDocument()
    expect(screen.getByText('Lovely guest')).toBeInTheDocument()
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

  it('shows thumbnails from photo_paths, opens the lightbox, and hides a broken image', async () => {
    const user = userEvent.setup()
    renderReview({
      photo_paths: ['user-1/a.jpg', 'user-1/b.jpg'],
      users: { full_name: 'Arun' },
    })

    const first = screen.getByRole('button', { name: 'View review photo 1 of 2' })
    expect(first.querySelector('img')).toHaveAttribute(
      'src',
      'https://cdn.test/review-photos/user-1/a.jpg',
    )
    expect(screen.getByRole('link', { name: 'Report' })).toHaveAttribute(
      'href',
      expect.stringContaining('review-1'),
    )
    expect(screen.queryByRole('button', { name: 'More actions' })).not.toBeInTheDocument()

    await user.click(first)
    expect(screen.getByRole('dialog', { name: "Arun's review photos" })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Close' }))

    fireEvent.error(screen.getByRole('button', { name: 'View review photo 2 of 2' }).querySelector('img'))
    expect(screen.queryByRole('button', { name: 'View review photo 2 of 2' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'View review photo 1 of 2' })).toBeInTheDocument()
  })
})
