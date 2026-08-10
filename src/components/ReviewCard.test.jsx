import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import ReviewCard from './ReviewCard'
import { makeReview } from '../test/fixtures'

function renderReview(overrides) {
  return render(<ReviewCard review={makeReview(overrides)} />)
}

describe('ReviewCard', () => {
  it('shows the reviewer name and their initial', () => {
    renderReview({ users: { full_name: 'Mei Ling' } })
    expect(screen.getByText('Mei Ling')).toBeInTheDocument()
    expect(screen.getByText('M')).toBeInTheDocument()
  })

  it('falls back to "Guest" when the reviewer has no name', () => {
    renderReview({ users: null })
    expect(screen.getByText('Guest')).toBeInTheDocument()
    expect(screen.getByText('G')).toBeInTheDocument()
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
