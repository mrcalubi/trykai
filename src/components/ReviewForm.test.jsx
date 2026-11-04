import { screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ReviewForm from './ReviewForm'
import { supabase } from '../lib/supabase'
import { renderWithRouter } from '../test/render'
import { HEIC_READ_ERROR, HEIC_UPDATED_ERROR } from '../lib/heicImage'
import { REVIEW_PHOTO_CONSENT, REVIEW_PHOTO_TOO_LARGE } from '../lib/reviewPhotos'

vi.mock('../lib/supabase')
vi.mock('../lib/compressImage', () => ({
  compressImage: vi.fn(async (file) => new File(['jpg'], `${file.name}.jpg`, { type: 'image/jpeg' })),
}))

import { compressImage } from '../lib/compressImage'

const USER_ID = 'user-1'
const booking = {
  id: 'booking-past',
  sessions: { listings: { host_id: 'host-1' } },
}

function jpeg(name = 'latte.jpg') {
  return new File(['jpeg'], name, { type: 'image/jpeg' })
}

describe('ReviewForm', () => {
  beforeEach(() => {
    supabase.__reset()
    compressImage.mockReset()
    compressImage.mockImplementation(
      async () => new File(['jpg'], 'shot.jpg', { type: 'image/jpeg' }),
    )
  })

  it('saves a rating-only review without sending photo_paths', async () => {
    const onSubmitted = vi.fn()
    supabase.rpc.mockResolvedValue({
      data: { review_id: 'r1', revealed: false, reveal_after: '2026-11-10T00:00:00Z' },
      error: null,
    })
    const { user } = renderWithRouter(
      <ReviewForm booking={booking} userId={USER_ID} onSubmitted={onSubmitted} />,
    )

    expect(screen.getByText(REVIEW_PHOTO_CONSENT)).toBeInTheDocument()
    expect(screen.getByText('Anything TryKai should know?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '5 stars' }))
    await user.click(screen.getByRole('button', { name: 'Post review' }))

    await waitFor(() => expect(supabase.rpc).toHaveBeenCalled())
    expect(supabase.rpc).toHaveBeenCalledWith('post_review', {
      p_booking_id: 'booking-past',
      p_reviewee_id: 'host-1',
      p_rating: 5,
      p_comment: null,
      p_photo_paths: [],
      p_private_note: null,
    })
    expect(onSubmitted).toHaveBeenCalled()
    expect(supabase.__calls('reviews', 'insert')).toHaveLength(0)
    expect(supabase.__bucket('review-photos').upload).not.toHaveBeenCalled()
    expect(supabase.functions.invoke).toHaveBeenCalledWith(
      'review-emails',
      expect.objectContaining({ body: { review_id: 'r1' } }),
    )
  })

  it('uploads up to 3 compressed photos before inserting', async () => {
    const { user } = renderWithRouter(<ReviewForm booking={booking} userId={USER_ID} />)

    await user.click(screen.getByRole('button', { name: '4 stars' }))
    await user.upload(screen.getByLabelText('Add photos'), [jpeg('a.jpg'), jpeg('b.jpg'), jpeg('c.jpg')])
    await waitFor(() => expect(screen.getAllByRole('button', { name: /Remove / })).toHaveLength(3))
    expect(screen.queryByLabelText('Add photos')).not.toBeInTheDocument()
    supabase.rpc.mockResolvedValue({ data: { review_id: 'r1' }, error: null })
    await user.click(screen.getByRole('button', { name: 'Post review' }))

    await waitFor(() => expect(supabase.rpc).toHaveBeenCalled())
    expect(supabase.__bucket('review-photos').upload).toHaveBeenCalledTimes(3)
    expect(supabase.__bucket('review-photos').upload.mock.calls[0][2]).toEqual({
      upsert: false,
      contentType: 'image/jpeg',
    })
    const paths = supabase.rpc.mock.calls.find((call) => call[0] === 'post_review')[1].p_photo_paths
    expect(paths).toHaveLength(3)
    expect(paths[0]).toMatch(new RegExp(`^${USER_ID}/[0-9a-f-]+\\.jpg$`, 'i'))
  })

  it('keeps the comment when a photo upload fails', async () => {
    supabase.__bucket('review-photos').upload.mockResolvedValueOnce({
      data: null,
      error: { message: 'denied' },
    })
    const { user } = renderWithRouter(<ReviewForm booking={booking} userId={USER_ID} />)

    await user.click(screen.getByRole('button', { name: '5 stars' }))
    await user.type(screen.getByLabelText('Comment'), 'Great session')
    await user.upload(screen.getByLabelText('Add photos'), jpeg('latte.jpg'))
    await waitFor(() => expect(screen.getByRole('button', { name: /Remove / })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Post review' }))

    expect(await screen.findByText(/latte\.jpg.+didn't upload/)).toBeInTheDocument()
    expect(screen.getByLabelText('Comment')).toHaveValue('Great session')
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('shows the HEIC read error on that pick and keeps the form', async () => {
    compressImage.mockRejectedValueOnce(new Error(HEIC_READ_ERROR))
    const { user } = renderWithRouter(<ReviewForm booking={booking} userId={USER_ID} />)

    await user.upload(
      screen.getByLabelText('Add photos'),
      new File(['h'], 'shot.heic', { type: 'image/heic' }),
    )

    expect(await screen.findByText(HEIC_READ_ERROR)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Post review' })).toBeInTheDocument()
  })

  it('asks the guest to refresh when the HEIC chunk failed to load', async () => {
    compressImage.mockRejectedValueOnce(new Error(HEIC_UPDATED_ERROR))
    const { user } = renderWithRouter(<ReviewForm booking={booking} userId={USER_ID} />)

    await user.upload(
      screen.getByLabelText('Add photos'),
      new File(['h'], 'shot.heic', { type: 'image/heic' }),
    )

    expect(await screen.findByText(HEIC_UPDATED_ERROR)).toBeInTheDocument()
  })

  it('rejects a compressed file that is still over 3 MB', async () => {
    compressImage.mockResolvedValueOnce(
      new File([new Uint8Array(3 * 1024 * 1024 + 1)], 'shot.jpg', { type: 'image/jpeg' }),
    )
    const { user } = renderWithRouter(<ReviewForm booking={booking} userId={USER_ID} />)

    await user.type(screen.getByLabelText('Comment'), 'Great session')
    await user.upload(screen.getByLabelText('Add photos'), jpeg())

    expect(await screen.findByText(REVIEW_PHOTO_TOO_LARGE)).toBeInTheDocument()
    expect(screen.getByLabelText('Comment')).toHaveValue('Great session')
    expect(screen.queryByRole('button', { name: /Remove / })).not.toBeInTheDocument()
  })

  it('lets the guest remove a photo before submit', async () => {
    const { user } = renderWithRouter(<ReviewForm booking={booking} userId={USER_ID} />)

    await user.upload(screen.getByLabelText('Add photos'), jpeg('latte.jpg'))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Remove latte.jpg' })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Remove latte.jpg' }))

    expect(screen.queryByRole('button', { name: /Remove / })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Add photos')).toBeInTheDocument()
  })
  it('shows empty stars as outlines until one is picked', async () => {
    const { user } = renderWithRouter(<ReviewForm booking={booking} userId={USER_ID} />)
    expect(screen.getByRole('button', { name: '3 stars' })).toHaveTextContent('☆')
    await user.click(screen.getByRole('button', { name: '3 stars' }))
    expect(screen.getByRole('button', { name: '3 stars' })).toHaveTextContent('★')
    expect(screen.getByRole('button', { name: '4 stars' })).toHaveTextContent('☆')
  })

  it('requires a star rating', async () => {
    const { user } = renderWithRouter(<ReviewForm booking={booking} userId={USER_ID} />)
    await user.click(screen.getByRole('button', { name: 'Post review' }))
    expect(await screen.findByText('Please select a star rating.')).toBeInTheDocument()
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('refuses a booking with no host on record', async () => {
    const { user } = renderWithRouter(
      <ReviewForm booking={{ id: 'booking-past', sessions: { listings: {} } }} userId={USER_ID} />,
    )
    await user.click(screen.getByRole('button', { name: '5 stars' }))
    await user.click(screen.getByRole('button', { name: 'Post review' }))
    expect(await screen.findByText('Could not find host for this booking.')).toBeInTheDocument()
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('says plainly when the booking was already reviewed', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { message: 'already_reviewed' } })
    const { user } = renderWithRouter(<ReviewForm booking={booking} userId={USER_ID} />)
    await user.click(screen.getByRole('button', { name: '5 stars' }))
    await user.click(screen.getByRole('button', { name: 'Post review' }))
    expect(await screen.findByText("You've already reviewed this booking.")).toBeInTheDocument()
  })

  it('names the close date when the review window has ended', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { message: 'review_window_closed' } })
    const { user } = renderWithRouter(
      <ReviewForm booking={booking} userId={USER_ID} closedOn="Sat, 10 Nov" />,
    )
    await user.click(screen.getByRole('button', { name: '5 stars' }))
    await user.click(screen.getByRole('button', { name: 'Post review' }))
    expect(await screen.findByText('Reviews for this session closed on Sat, 10 Nov.')).toBeInTheDocument()
  })

  it('shows any other insert error as it came back', async () => {
    supabase.rpc.mockResolvedValue({
      data: null,
      error: { message: 'new row violates row-level security policy' },
    })
    const { user } = renderWithRouter(<ReviewForm booking={booking} userId={USER_ID} />)
    await user.click(screen.getByRole('button', { name: '5 stars' }))
    await user.click(screen.getByRole('button', { name: 'Post review' }))
    expect(await screen.findByText('new row violates row-level security policy')).toBeInTheDocument()
  })

  it('sends a trimmed private note through post_review', async () => {
    supabase.rpc.mockResolvedValue({ data: { review_id: 'r1' }, error: null })
    const { user } = renderWithRouter(<ReviewForm booking={booking} userId={USER_ID} />)
    await user.click(screen.getByRole('button', { name: '5 stars' }))
    await user.type(
      screen.getByPlaceholderText('A problem, or an idea to make TryKai better'),
      '  The kitchen was cold  ',
    )
    await user.click(screen.getByRole('button', { name: 'Post review' }))
    await waitFor(() => expect(supabase.rpc).toHaveBeenCalled())
    expect(supabase.rpc.mock.calls[0][1].p_private_note).toBe('The kitchen was cold')
  })
})
