/**
 * Desktop only: checkout replaces the sticky booking card and flows with the
 * page. If the guest pressed Book far down, its top (guests, add-ons) is above
 * the screen, so bring it into view. Phones show checkout full screen.
 */
export function shouldBringCheckoutIntoView(isDesktop, cardTop) {
  return Boolean(isDesktop) && typeof cardTop === 'number' && cardTop < 0
}
