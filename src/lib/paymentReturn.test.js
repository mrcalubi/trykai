import { describe, expect, it } from 'vitest'
import {
  bookingStatusMessage,
  checkoutCanLeaveForWebhook,
  paymentStatusFromIntent,
  paymentWasDeclined,
} from './paymentReturn'

const NOT_COMPLETED = 'This booking was not completed. You can try booking again.'
const PAYMENT_RECEIVED =
  'Payment received — your booking should appear shortly. Refresh if it does not update.'

describe('bookingStatusMessage', () => {
  it('confirms only a booking the webhook has already confirmed', () => {
    expect(bookingStatusMessage({ bookingStatus: 'confirmed' })).toEqual({
      tone: 'success',
      text: 'Booking confirmed! Your payment was successful.',
    })
  })

  it('does not call a cancelled or failed checkout a received payment', () => {
    expect(bookingStatusMessage({ bookingStatus: 'cancelled' }).text).toBe(NOT_COMPLETED)
    expect(
      bookingStatusMessage({ bookingStatus: 'pending', redirectStatus: 'failed' })
    ).toEqual({ tone: 'error', text: NOT_COMPLETED })
    expect(
      bookingStatusMessage({ bookingStatus: 'pending', paymentStatus: 'failed', timedOut: true })
    ).toEqual({ tone: 'error', text: NOT_COMPLETED })
  })

  it('keeps waiting while a successful charge is still syncing', () => {
    expect(
      bookingStatusMessage({ bookingStatus: 'pending', paymentStatus: 'succeeded' }).text
    ).toBe('Processing your booking…')
    expect(
      bookingStatusMessage({
        bookingStatus: 'pending',
        redirectStatus: 'succeeded',
        timedOut: true,
      }).text
    ).toBe(PAYMENT_RECEIVED)
  })

  it('does not claim a still-pending booking was paid when Stripe never accepted it', () => {
    expect(bookingStatusMessage({ bookingStatus: 'pending', timedOut: true })).toEqual({
      tone: 'error',
      text: NOT_COMPLETED,
    })
  })

  it('says a processing charge is still processing after the wait', () => {
    expect(
      bookingStatusMessage({
        bookingStatus: 'pending',
        paymentStatus: 'processing',
        timedOut: true,
      }).text
    ).toBe('Your payment is still processing. Refresh if the status does not update.')
  })
})

describe('payment intent status', () => {
  it('treats a canceled or abandoned intent as not collected', () => {
    expect(paymentStatusFromIntent('canceled')).toBe('failed')
    expect(paymentStatusFromIntent('requires_payment_method')).toBe('failed')
    expect(paymentWasDeclined({ paymentStatus: 'failed' })).toBe(true)
    expect(paymentWasDeclined({ redirectStatus: 'failed' })).toBe(true)
    expect(paymentWasDeclined({ redirectStatus: 'succeeded' })).toBe(false)
  })

  it('only leaves the listing after Stripe has accepted the charge', () => {
    expect(checkoutCanLeaveForWebhook('succeeded')).toBe(true)
    expect(checkoutCanLeaveForWebhook('processing')).toBe(true)
    expect(checkoutCanLeaveForWebhook('canceled')).toBe(false)
    expect(checkoutCanLeaveForWebhook('requires_payment_method')).toBe(false)
    expect(checkoutCanLeaveForWebhook(undefined)).toBe(false)
  })
})