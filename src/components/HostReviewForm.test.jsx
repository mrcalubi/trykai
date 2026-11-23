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
    const status = screen.getByText(/days? left$/)
    expect(status).toHaveTextContent(/^Reviewed you · \d+ days? left$/)
    expect(screen.queryByText(/left you a review/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Reviews close/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Review' }))
    expect(screen.getByRole('heading', { name: 'How was Sam?' })).toBeInTheDocument()
  })

  it('shows only the days left when the guest has not reviewed yet', () => {
    renderWithRouter(
      <HostReviewsDueList rows={[{ ...dueRow, guest_reviewed: false }]} now={Date.now()} />,
    )
    expect(screen.getByText(/days? left$/)).toHaveTextContent(/^\d+ days? left$/)
    expect(screen.queryByText(/Reviewed you/)).not.toBeInTheDocument()
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

describe('HostReviewsDueList · friends on a booking', () => {
  beforeEach(() => {
    supabase.__reset()
    supabase.rpc.mockResolvedValue({ data: { review_id: 'r-host' }, error: null })
  })

  it('lists the booker and a friend on the same booking separately', async () => {
    const friend = { ...dueRow, guest_id: 'friend-1', guest_display_name: 'Mei Ling', guest_reviewed: false, booked_by: 'Sam' }
    const { user } = renderWithRouter(<HostReviewsDueList rows={[dueRow, friend]} now={Date.now()} />)

    expect(screen.getByRole('heading', { name: '2 guests to review' })).toBeInTheDocument()
    expect(screen.getByText(/· with Sam/)).toBeInTheDocument()

    const buttons = screen.getAllByRole('button', { name: 'Review' })
    await user.click(buttons[1])
    expect(screen.getByRole('heading', { name: 'How was Mei Ling?' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'How was Sam?' })).not.toBeInTheDocument()
  })
})

describe('HostReviewsDueList · editing a hidden review', () => {
  const reviewed = { ...dueRow, host_reviewed: true, guest_reviewed: false }
  const mine = {
    id: 'r-host',
    booking_id: 'booking-1',
    reviewee_id: 'guest-1',
    rating: 4,
    comment: 'Sam was early.',
    photo_paths: [],
    reveal_after: hoursFromNow(24 * 5),
    revealed_at: null,
  }

  beforeEach(() => {
    supabase.__reset()
    supabase.rpc.mockResolvedValue({ data: { review_id: 'r-host', revealed: false }, error: null })
  })

  it('offers Edit while hidden and saves through edit_review without emailing', async () => {
    const { user } = renderWithRouter(
      <HostReviewsDueList rows={[reviewed]} myReviews={[mine]} now={Date.now()} />,
    )
    expect(screen.queryByText('Done')).not.toBeInTheDocument()
    expect(screen.getByText('You can change it until it goes live')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Edit review of Sam' }))
    expect(screen.getByLabelText('Comment')).toHaveValue('Sam was early.')
    expect(screen.queryByText('Anything TryKai should know?')).not.toBeInTheDocument()
    await user.clear(screen.getByLabelText('Comment'))
    await user.type(screen.getByLabelText('Comment'), 'Sam was early and kind.')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() =>
      expect(supabase.rpc).toHaveBeenCalledWith('edit_review', {
        p_review_id: 'r-host',
        p_rating: 4,
        p_comment: 'Sam was early and kind.',
        p_photo_paths: [],
      }),
    )
    expect(supabase.functions.invoke).not.toHaveBeenCalled()
    expect(await screen.findByRole('button', { name: 'Edit review of Sam' })).toBeInTheDocument()
  })

  it('shows Done once the review is live', () => {
    renderWithRouter(
      <HostReviewsDueList
        rows={[reviewed]}
        myReviews={[{ ...mine, revealed_at: hoursFromNow(-1) }]}
        now={Date.now()}
      />,
    )
    expect(screen.getByText('Done')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Edit review/ })).not.toBeInTheDocument()
  })

  it('closes the form and explains when the guest posted first', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { message: 'review_revealed' } })
    const { user } = renderWithRouter(
      <HostReviewsDueList rows={[reviewed]} myReviews={[mine]} now={Date.now()} />,
    )
    await user.click(screen.getByRole('button', { name: 'Edit review of Sam' }))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(
      await screen.findByText("Sam reviewed you too, so your review is live now and can't be changed."),
    ).toBeInTheDocument()
    expect(screen.getByText('Done')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument()
  })

  it('lets the host edit a review they just posted', async () => {
    supabase.rpc.mockResolvedValue({
      data: { review_id: 'r-new', revealed: false, reveal_after: hoursFromNow(24 * 5) },
      error: null,
    })
    const { user } = renderWithRouter(<HostReviewsDueList rows={[dueRow]} now={Date.now()} />)
    await user.click(screen.getByRole('button', { name: 'Review' }))
    await user.click(screen.getByRole('button', { name: '5 stars' }))
    await user.type(screen.getByLabelText('Comment'), 'Sam was early and kind.')
    await user.click(screen.getByRole('button', { name: 'Post review' }))

    await user.click(await screen.findByRole('button', { name: 'Edit review of Sam' }))
    expect(screen.getByLabelText('Comment')).toHaveValue('Sam was early and kind.')
  })
})
