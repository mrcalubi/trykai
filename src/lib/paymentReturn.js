/**
 * What to tell a guest who just came back from checkout.
 * A still-pending row is not proof the card or PayNow charge went through:
 * cancelling checkout leaves the booking pending until the webhook marks it
 * cancelled. Only a positive signal from Stripe may say the payment was received.
 */
export function bookingStatusMessage({
  bookingStatus = null,
  redirectStatus = null,
  paymentStatus = null,
  timedOut = false,
} = {}) {
  if (bookingStatus === 'confirmed') {
    return {
      tone: 'success',
      text: 'Booking confirmed! Your payment was successful.',
    }
  }

  const declined = redirectStatus === 'failed' || paymentStatus === 'failed'
  if (bookingStatus === 'cancelled' || declined) {
    return {
      tone: 'error',
      text: 'This booking was not completed. You can try booking again.',
    }
  }

  if (!timedOut) {
    return { tone: 'success', text: 'Processing your booking…' }
  }

  const accepted = redirectStatus === 'succeeded' || paymentStatus === 'succeeded'
  if (accepted) {
    return {
      tone: 'success',
      text: 'Payment received — your booking should appear shortly. Refresh if it does not update.',
    }
  }

  const processing = redirectStatus === 'pending' || paymentStatus === 'processing'
  if (processing) {
    return {
      tone: 'success',
      text: 'Your payment is still processing. Refresh if the status does not update.',
    }
  }

  return {
    tone: 'error',
    text: 'This booking was not completed. You can try booking again.',
  }
}

export function paymentWasDeclined({ redirectStatus = null, paymentStatus = null } = {}) {
  return redirectStatus === 'failed' || paymentStatus === 'failed'
}

/** Stripe PaymentIntent.status → the signals bookingStatusMessage understands. */
export function paymentStatusFromIntent(status) {
  if (status === 'succeeded') return 'succeeded'
  if (status === 'processing') return 'processing'
  if (status === 'canceled' || status === 'requires_payment_method') return 'failed'
  return null
}

export function checkoutCanLeaveForWebhook(status) {
  const paymentStatus = paymentStatusFromIntent(status)
  return paymentStatus === 'succeeded' || paymentStatus === 'processing'
}
