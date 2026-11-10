import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from './supabase'
import {
  checkReplyBody,
  deleteReviewReply,
  fetchReviewReplies,
  loadRepliesInto,
  mergeReplies,
  replaceReply,
  REPLY_MAX_LENGTH,
  saveReviewReply,
} from './reviewReplies'

vi.mock('./supabase')

const REPLY = { review_id: 'r1', body: 'Thanks!', host_display_name: 'Pris' }

describe('review replies', () => {
  beforeEach(() => {
    supabase.__reset()
  })

  it('fetches replies by review id, without calling for an empty list', async () => {
    expect(await fetchReviewReplies([])).toEqual({})
    expect(await fetchReviewReplies(null)).toEqual({})
    expect(supabase.rpc).not.toHaveBeenCalled()

    supabase.rpc.mockResolvedValueOnce({ data: [REPLY, null], error: null })
    expect(await fetchReviewReplies(['r1', 'r2', 'r1', null])).toEqual({ r1: REPLY })
    expect(supabase.rpc).toHaveBeenCalledWith('review_replies', { p_review_ids: ['r1', 'r2'] })
  })

  it('shows reviews without replies when the read fails', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202' } })
    expect(await fetchReviewReplies(['r1'])).toEqual({})
    supabase.rpc.mockResolvedValueOnce({ data: 'nope', error: null })
    expect(await fetchReviewReplies(['r1'])).toEqual({})
    supabase.rpc.mockRejectedValueOnce(new Error('offline'))
    expect(await fetchReviewReplies(['r1'])).toEqual({})
  })

  it('merges replies only into the reviews that were asked about', () => {
    const reviews = [{ id: 'r1' }, { id: 'r2' }, { id: 'r3', reply: REPLY }]
    expect(mergeReplies(reviews, { r1: REPLY }, ['r1', 'r2'])).toEqual([
      { id: 'r1', reply: REPLY },
      { id: 'r2', reply: null },
      { id: 'r3', reply: REPLY },
    ])
    expect(mergeReplies(null, {}, null)).toEqual([])
    expect(mergeReplies([{ id: 'r1' }], null, ['r1'])).toEqual([{ id: 'r1', reply: null }])
  })

  it('loads replies into state with an updater', async () => {
    const setReviews = vi.fn()
    await loadRepliesInto([], setReviews)
    await loadRepliesInto(null, setReviews)
    expect(setReviews).not.toHaveBeenCalled()

    supabase.rpc.mockResolvedValueOnce({ data: [REPLY], error: null })
    await loadRepliesInto([{ id: 'r1' }], setReviews)
    const updater = setReviews.mock.calls[0][0]
    expect(updater([{ id: 'r1' }, { id: 'other' }])).toEqual([{ id: 'r1', reply: REPLY }, { id: 'other' }])
  })

  it('replaces one reply after a save or delete', () => {
    const update = replaceReply('r2', REPLY)
    expect(update([{ id: 'r1' }, { id: 'r2' }])).toEqual([{ id: 'r1' }, { id: 'r2', reply: REPLY }])
    expect(replaceReply('r1', null)(null)).toEqual([])
  })

  it('checks the reply text', () => {
    expect(checkReplyBody('  hi  ')).toEqual({ text: 'hi', error: '' })
    expect(checkReplyBody('   ').error).toBe('Write a reply first.')
    expect(checkReplyBody(undefined).error).toBe('Write a reply first.')
    expect(checkReplyBody('a'.repeat(REPLY_MAX_LENGTH + 1)).error).toBe('Keep it to 600 characters.')
  })

  it('saves a reply, trimmed', async () => {
    expect(await saveReviewReply('r1', ' ')).toEqual({ error: 'Write a reply first.' })
    expect(supabase.rpc).not.toHaveBeenCalled()

    supabase.rpc.mockResolvedValueOnce({ data: [REPLY], error: null })
    expect(await saveReviewReply('r1', ' Thanks! ')).toEqual({ reply: REPLY })
    expect(supabase.rpc).toHaveBeenCalledWith('reply_to_review', { p_review_id: 'r1', p_body: 'Thanks!' })
    supabase.rpc.mockResolvedValueOnce({ data: REPLY, error: null })
    expect(await saveReviewReply('r1', 'Thanks!')).toEqual({ reply: REPLY })
  })

  it('words save failures for the host', async () => {
    supabase.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'you can reply once the review is public' },
    })
    expect(await saveReviewReply('r1', 'Hi')).toEqual({ error: 'You can reply once the review is public.' })
    supabase.rpc.mockResolvedValueOnce({ data: null, error: {} })
    expect(await saveReviewReply('r1', 'Hi')).toEqual({ error: "Couldn't save your reply. Try again." })
    supabase.rpc.mockResolvedValueOnce({ data: [], error: null })
    expect(await saveReviewReply('r1', 'Hi')).toEqual({ error: "Couldn't save your reply. Try again." })
    supabase.rpc.mockRejectedValueOnce(new Error('offline'))
    expect(await saveReviewReply('r1', 'Hi')).toEqual({ error: "Couldn't save your reply. Try again." })
  })

  it('deletes a reply', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: true, error: null })
    expect(await deleteReviewReply('r1')).toBe(true)
    expect(supabase.rpc).toHaveBeenCalledWith('delete_review_reply', { p_review_id: 'r1' })
    supabase.rpc.mockResolvedValueOnce({ data: false, error: null })
    expect(await deleteReviewReply('r1')).toBe(false)
    supabase.rpc.mockResolvedValueOnce({ data: null, error: { message: 'x' } })
    expect(await deleteReviewReply('r1')).toBe(false)
    supabase.rpc.mockRejectedValueOnce(new Error('offline'))
    expect(await deleteReviewReply('r1')).toBe(false)
  })
})
