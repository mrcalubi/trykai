/**
 * Host-facing cancel copy. Never includes a guest's payment or refund amount.
 */
export function hostCancelGuestPhrase(guestCount) {
  const n = Number(guestCount)
  if (!Number.isFinite(n) || n <= 1) return 'your guest'
  if (n === 2) return 'both guests'
  return `all ${n} guests`
}

export function hostCancelWarning(guestCount) {
  return `Cancelling refunds ${hostCancelGuestPhrase(guestCount)} in full and adds a strike to your account.`
}
