import { screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import HostReviewForm, { HostReviewsDueList } from './HostReviewForm'
import { supabase } from '../lib/supabase'
import { renderWithRouter } from '../test/render'
import { hoursFromNow } from '../test/fixtures'

vi.mock('../lib/supabase')

const dueRow = {
  booking_id: 'booking-1',
  guest_id: 'guest-1',
  guest_display_name: 'Sam',
  listing_title: 'Latte art',
  starts_at: hoursFromNow(-24),
  deadline: hoursFromNow(24 * 5),
  host_reviewed: false,
  guest_reviewed: true,
}

describe('HostReviewForm', () => {
  beforeEach(() => {
    supabase.__reset()
    supabase.rpc.mockResolvedValue({ data: { review_id: 'r-host' }, error: null })
  })

  it('posts a host review with empty photo_paths and the private note', async () => {
    const onSubmitted = vi.fn()
    const { user } = renderWithRouter(<HostReviewForm row={dueRow} onSubmitted={onSubmitted} />)

    expect(screen.getByRole('heading', { name: 'How was Sam?' })).toBeInTheDocument()
    expect(screen.getByText("Your words show on Sam's profile. Stars stay private.")).toBeInTheDocument()
    expect(screen.getByText('Anything TryKai should know?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '5 stars' }))
    await user.type(screen.getByLabelText('Comment'), 'Sam was early and kind.')
    await user.type(
      screen.getByPlaceholderText('A problem, or an idea to make TryKai better'),
      '  They asked about allergies  ',
    )
    await user.click(screen.getByRole('button', { name: 'Post review' }))

    await waitFor(() => expect(supabase.rpc).toHaveBeenCalled())
    expect(supabase.rpc).toHaveBeenCalledWith('post_review', {
      p_booking_id: 'booking-1',
      p_reviewee_id: 'guest-1',
      p_rating: 5,
      p_comment: 'Sam was early and kind.',
      p_photo_paths: [],
      p_private_note: 'They asked about allergies',
    })
    expect(onSubmitted).toHaveBeenCalled()
    expect(supabase.functions.invoke).toHaveBeenCalledWith(
      'review-emails',
      expect.objectContaining({ body: { review_id: 'r-host' } }),
    )
  })

  it('requires a written review of at least 10 characters', async () => {
    const { user } = renderWithRouter(<HostReviewForm row={dueRow} />)
    await user.click(screen.getByRole('button', { name: '4 stars' }))
    await user.type(screen.getByLabelText('Comment'), 'Too short')
    await user.click(screen.getByRole('button', { name: 'Post review' }))
    expect(await screen.findByText('Write 10 to 1000 characters.')).toBeInTheDocument()
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('requires a star rating and maps already_reviewed', async () => {
    const { user } = renderWithRouter(<HostReviewForm row={{ ...dueRow, guest_display_name: '' }} />)
    await user.type(screen.getByLabelText('Comment'), 'Sam was early and kind.')
    await user.click(screen.getByRole('button', { name: 'Post review' }))
    expect(await screen.findByText('Please select a star rating.')).toBeInTheDocument()

    supabase.rpc.mockResolvedValueOnce({ data: null, error: { message: 'already_reviewed' } })
    await user.click(screen.getByRole('button', { name: '5 stars' }))
    await user.click(screen.getByRole('button', { name: 'Post review' }))
    expect(await screen.findByText("You've already reviewed this booking.")).toBeInTheDocument()
  })

  it('keeps a thrown save error on the form', async () => {
    supabase.rpc.mockRejectedValueOnce(new Error('network down'))
    const { user } = renderWithRouter(<HostReviewForm row={dueRow} />)
    await user.click(screen.getByRole('button', { name: '5 stars' }))
    await user.type(screen.getByLabelText('Comment'), 'Sam was early and kind.')
    await user.click(screen.getByRole('button', { name: 'Post review' }))
    expect(await screen.findByText('network down')).toBeInTheDocument()
  })

  it('lets the host cancel the form', async () => {
    const onCancel = vi.fn()
    const { user } = renderWithRouter(<HostReviewForm row={dueRow} onCancel={onCancel} />)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalled()
  })
})

describe('HostReviewsDueList', () => {
  beforeEach(() => {
    supabase.__reset()
  })

  it('lists guests to review and nudges when the guest already posted', async () => {
    const { user } = renderWithRouter(<HostReviewsDueList rows={[dueRow]} now={Date.now()} />)

    expect(screen.getByRole('heading', { name: '1 guest to review' })).toBeInTheDocument()
    expect(screen.getByText(/Sam left you a review. Review Sam to see it/)).toBeInTheDocument()
    expect(screen.getByText(/Reviews close/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Review' }))
    expect(screen.getByRole('heading', { name: 'How was Sam?' })).toBeInTheDocument()
  })

  it('marks a row Done after the host posts', async () => {
    supabase.rpc.mockResolvedValue({ data: { review_id: 'r-host' }, error: null })
    const { user } = renderWithRouter(<HostReviewsDueList rows={[dueRow]} />)

    await user.click(screen.getByRole('button', { name: 'Review' }))
    await user.click(screen.getByRole('button', { name: '5 stars' }))
    await user.type(screen.getByLabelText('Comment'), 'Sam was early and kind.')
    await user.click(screen.getByRole('button', { name: 'Post review' }))

    expect(await screen.findByText('Done')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '0 guests to review' })).toBeInTheDocument()
  })

  it('renders nothing when nobody is due', () => {
    const { container } = renderWithRouter(<HostReviewsDueList rows={[]} />)
    expect(container.querySelector('.hosting-reviews')).not.toBeInTheDocument()
  })

  it('shows Done for a guest already reviewed and a one-day nudge', () => {
    renderWithRouter(
      <HostReviewsDueList
        now={Date.parse('2026-11-03T00:00:00Z')}
        rows={[
          { ...dueRow, host_reviewed: true, guest_display_name: '  ' },
          {
            ...dueRow,
            booking_id: 'booking-2',
            guest_display_name: 'Arun',
            host_reviewed: false,
            guest_reviewed: true,
            deadline: '2026-11-04T00:00:00Z',
          },
        ]}
      />,
    )
    expect(screen.getByRole('heading', { name: '1 guest to review' })).toBeInTheDocument()
    expect(screen.getByText('Done')).toBeInTheDocument()
    expect(screen.getByText(/1 day left/)).toBeInTheDocument()
    expect(screen.getByText('Guest')).toBeInTheDocument()
  })
})
