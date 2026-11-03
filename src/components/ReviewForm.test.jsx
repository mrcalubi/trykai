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
    const { user } = renderWithRouter(
      <ReviewForm booking={booking} userId={USER_ID} onSubmitted={onSubmitted} />,
    )

    expect(screen.getByText(REVIEW_PHOTO_CONSENT)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '5 stars' }))
    await user.click(screen.getByRole('button', { name: 'Leave a review' }))

    await waitFor(() => expect(supabase.__calls('reviews', 'insert')).toHaveLength(1))
    expect(supabase.__lastCall('reviews', 'insert').payload).toEqual({
      booking_id: 'booking-past',
      reviewer_id: USER_ID,
      reviewee_id: 'host-1',
      rating: 5,
      comment: null,
      role: 'guest',
    })
    expect(onSubmitted).toHaveBeenCalled()
    expect(supabase.__bucket('review-photos').upload).not.toHaveBeenCalled()
  })

  it('uploads up to 3 compressed photos before inserting', async () => {
    const { user } = renderWithRouter(<ReviewForm booking={booking} userId={USER_ID} />)

    await user.click(screen.getByRole('button', { name: '4 stars' }))
    await user.upload(screen.getByLabelText('Photos'), [jpeg('a.jpg'), jpeg('b.jpg'), jpeg('c.jpg')])
    await waitFor(() => expect(screen.getAllByRole('button', { name: /Remove / })).toHaveLength(3))
    expect(screen.queryByLabelText('Photos')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Leave a review' }))

    await waitFor(() => expect(supabase.__calls('reviews', 'insert')).toHaveLength(1))
    expect(supabase.__bucket('review-photos').upload).toHaveBeenCalledTimes(3)
    expect(supabase.__bucket('review-photos').upload.mock.calls[0][2]).toEqual({
      upsert: false,
      contentType: 'image/jpeg',
    })
    const paths = supabase.__lastCall('reviews', 'insert').payload.photo_paths
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
    await user.upload(screen.getByLabelText('Photos'), jpeg('latte.jpg'))
    await waitFor(() => expect(screen.getByRole('button', { name: /Remove / })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Leave a review' }))

    expect(await screen.findByText(/latte\.jpg.+didn't upload/)).toBeInTheDocument()
    expect(screen.getByLabelText('Comment')).toHaveValue('Great session')
    expect(supabase.__calls('reviews', 'insert')).toHaveLength(0)
  })

  it('shows the HEIC read error on that pick and keeps the form', async () => {
    compressImage.mockRejectedValueOnce(new Error(HEIC_READ_ERROR))
    const { user } = renderWithRouter(<ReviewForm booking={booking} userId={USER_ID} />)

    await user.upload(
      screen.getByLabelText('Photos'),
      new File(['h'], 'shot.heic', { type: 'image/heic' }),
    )

    expect(await screen.findByText(HEIC_READ_ERROR)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Leave a review' })).toBeInTheDocument()
  })

  it('asks the guest to refresh when the HEIC chunk failed to load', async () => {
    compressImage.mockRejectedValueOnce(new Error(HEIC_UPDATED_ERROR))
    const { user } = renderWithRouter(<ReviewForm booking={booking} userId={USER_ID} />)

    await user.upload(
      screen.getByLabelText('Photos'),
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
    await user.upload(screen.getByLabelText('Photos'), jpeg())

    expect(await screen.findByText(REVIEW_PHOTO_TOO_LARGE)).toBeInTheDocument()
    expect(screen.getByLabelText('Comment')).toHaveValue('Great session')
    expect(screen.queryByRole('button', { name: /Remove / })).not.toBeInTheDocument()
  })

  it('lets the guest remove a photo before submit', async () => {
    const { user } = renderWithRouter(<ReviewForm booking={booking} userId={USER_ID} />)

    await user.upload(screen.getByLabelText('Photos'), jpeg('latte.jpg'))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Remove latte.jpg' })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Remove latte.jpg' }))

    expect(screen.queryByRole('button', { name: /Remove / })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Photos')).toBeInTheDocument()
  })
})
