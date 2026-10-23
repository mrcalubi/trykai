import { describe, expect, it } from 'vitest'
import {
  isResubmission,
  listingReviewBadge,
  MAX_LISTING_REVIEW_NOTE_LENGTH,
  needsSubmittedNotice,
  prepareListingReview,
} from './listingReview'

describe('prepareListingReview', () => {
  it('approves without a note, dropping any that was typed', () => {
    expect(prepareListingReview({ decision: 'approved', note: '  looks good ' })).toEqual({
      ok: true,
      decision: 'approved',
      note: null,
    })
    expect(prepareListingReview({ decision: 'approved', note: undefined })).toMatchObject({ ok: true })
  })

  it('needs a note to ask for changes, trimmed', () => {
    expect(prepareListingReview({ decision: 'changes_requested', note: '   ' })).toMatchObject({
      ok: false,
      status: 400,
    })
    expect(prepareListingReview({ decision: 'changes_requested', note: ' Add a photo ' })).toEqual({
      ok: true,
      decision: 'changes_requested',
      note: 'Add a photo',
    })
  })

  it('bounds the note', () => {
    const long = 'x'.repeat(MAX_LISTING_REVIEW_NOTE_LENGTH + 1)
    expect(prepareListingReview({ decision: 'changes_requested', note: long }).ok).toBe(false)
    expect(
      prepareListingReview({ decision: 'changes_requested', note: long.slice(1) }).ok,
    ).toBe(true)
  })

  it('refuses anything else', () => {
    for (const decision of ['rejected', 'pending', '', null, 1]) {
      expect(prepareListingReview({ decision, note: 'x' }).ok).toBe(false)
    }
  })
})

describe('needsSubmittedNotice', () => {
  const requested = '2026-10-23T10:00:00.000Z'

  it('tells the team about a pending listing once', () => {
    expect(needsSubmittedNotice({ review_status: 'pending', review_requested_at: requested })).toBe(true)
    expect(
      needsSubmittedNotice({
        review_status: 'pending',
        review_requested_at: requested,
        review_notified_at: '2026-10-23T10:00:01.000Z',
      }),
    ).toBe(false)
  })

  it('tells them again after the host fixes a listing', () => {
    expect(
      needsSubmittedNotice({
        review_status: 'pending',
        review_requested_at: requested,
        review_notified_at: '2026-10-22T09:00:00.000Z',
      }),
    ).toBe(true)
  })

  it('ignores listings that are not waiting, and unreadable dates', () => {
    expect(needsSubmittedNotice({ review_status: 'approved' })).toBe(false)
    expect(needsSubmittedNotice({ review_status: 'changes_requested' })).toBe(false)
    expect(
      needsSubmittedNotice({ review_status: 'pending', review_requested_at: null, review_notified_at: 'soon' }),
    ).toBe(false)
  })
})

describe('isResubmission', () => {
  it('is a resubmission once the team has been told before', () => {
    expect(isResubmission({ review_notified_at: null })).toBe(false)
    expect(isResubmission({ review_notified_at: '2026-10-22T09:00:00.000Z' })).toBe(true)
  })
})

describe('listingReviewBadge', () => {
  it('labels the two states a host can be waiting in', () => {
    expect(listingReviewBadge('pending')).toEqual({ label: 'In review', tone: 'review' })
    expect(listingReviewBadge('changes_requested')).toEqual({ label: 'Changes needed', tone: 'changes' })
    expect(listingReviewBadge('approved')).toBeNull()
    expect(listingReviewBadge(undefined)).toBeNull()
  })
})
