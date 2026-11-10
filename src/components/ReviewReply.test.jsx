import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ReviewCard from './ReviewCard'
import { makeReview } from '../test/fixtures'
import { supabase } from '../lib/supabase'

vi.mock('../lib/supabase')

const REPLY = {
  review_id: 'review-1',
  body: 'Thank you for coming!',
  created_at: '2026-03-15T02:00:00.000Z',
  updated_at: '2026-03-15T02:00:00.000Z',
  host_display_name: 'Pris',
}

describe('host reply on a review', () => {
  beforeEach(() => {
    supabase.__reset()
  })

  it('shows nothing extra to guests when there is no reply', () => {
    render(<ReviewCard review={makeReview()} />)
    expect(screen.queryByText(/Reply/)).not.toBeInTheDocument()
  })

  it('shows the reply to everyone, without host controls', () => {
    render(<ReviewCard review={makeReview({ reply: REPLY })} />)
    expect(screen.getByText('Reply from Pris')).toBeInTheDocument()
    expect(screen.getByText('Thank you for coming!')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
  })

  it('falls back to the page host name', () => {
    render(<ReviewCard review={makeReview({ reply: { ...REPLY, host_display_name: null } })} hostName="Pris T" />)
    expect(screen.getByText('Reply from Pris T')).toBeInTheDocument()
  })

  it('lets the host post a reply', async () => {
    const user = userEvent.setup()
    const onReplyChange = vi.fn()
    supabase.rpc.mockResolvedValueOnce({ data: [REPLY], error: null })
    render(<ReviewCard review={makeReview()} canReply hostName="Pris" onReplyChange={onReplyChange} />)

    await user.click(screen.getByRole('button', { name: 'Reply publicly' }))
    await user.click(screen.getByRole('button', { name: 'Post reply' }))
    expect(screen.getByText('Write a reply first.')).toBeInTheDocument()
    expect(supabase.rpc).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText('Your public reply'), 'Thank you for coming!')
    await user.click(screen.getByRole('button', { name: 'Post reply' }))
    await waitFor(() => expect(onReplyChange).toHaveBeenCalledWith('review-1', REPLY))
    expect(supabase.rpc).toHaveBeenCalledWith('reply_to_review', {
      p_review_id: 'review-1',
      p_body: 'Thank you for coming!',
    })
  })

  it('shows a save error and keeps the draft', async () => {
    const user = userEvent.setup()
    supabase.rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
    render(<ReviewCard review={makeReview()} canReply />)
    await user.click(screen.getByRole('button', { name: 'Reply publicly' }))
    await user.type(screen.getByLabelText('Your public reply'), 'Hi')
    await user.click(screen.getByRole('button', { name: 'Post reply' }))
    expect(await screen.findByText("Couldn't save your reply. Try again.")).toBeInTheDocument()
    expect(screen.getByLabelText('Your public reply')).toHaveValue('Hi')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('button', { name: 'Reply publicly' })).toBeInTheDocument()
  })

  it('counts down near the limit', async () => {
    const user = userEvent.setup()
    render(<ReviewCard review={makeReview({ reply: { ...REPLY, body: 'a'.repeat(550) } })} canReply />)
    await user.click(screen.getByRole('button', { name: 'Edit' }))
    expect(screen.getByLabelText('Edit your reply')).toHaveValue('a'.repeat(550))
    expect(screen.getByText(/50 characters left/)).toBeInTheDocument()
  })

  it('edits a reply, keeping the host name', async () => {
    const user = userEvent.setup()
    const onReplyChange = vi.fn()
    const saved = { review_id: 'review-1', body: 'Updated', created_at: REPLY.created_at, updated_at: REPLY.updated_at }
    supabase.rpc.mockResolvedValueOnce({ data: [saved], error: null })
    render(<ReviewCard review={makeReview({ reply: REPLY })} canReply onReplyChange={onReplyChange} />)
    await user.click(screen.getByRole('button', { name: 'Edit' }))
    const field = screen.getByLabelText('Edit your reply')
    await user.clear(field)
    await user.type(field, 'Updated')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(onReplyChange).toHaveBeenCalledWith('review-1', { ...saved, host_display_name: 'Pris' }),
    )
  })

  it('asks before deleting, and reports a failed delete', async () => {
    const user = userEvent.setup()
    const onReplyChange = vi.fn()
    render(<ReviewCard review={makeReview({ reply: REPLY })} canReply onReplyChange={onReplyChange} />)

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.click(screen.getByRole('button', { name: 'Keep it' }))
    expect(supabase.rpc).not.toHaveBeenCalled()

    supabase.rpc.mockResolvedValueOnce({ data: false, error: null })
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.click(screen.getByRole('button', { name: 'Yes, delete' }))
    expect(await screen.findByText("Couldn't delete your reply. Try again.")).toBeInTheDocument()
    expect(onReplyChange).not.toHaveBeenCalled()

    supabase.rpc.mockResolvedValueOnce({ data: true, error: null })
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.click(screen.getByRole('button', { name: 'Yes, delete' }))
    await waitFor(() => expect(onReplyChange).toHaveBeenCalledWith('review-1', null))
  })
})
