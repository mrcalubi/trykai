/**
 * Where the signed-in "become a host" entry point should send someone, and
 * what to call it. Approved hosts skip verification and go to create listing.
 */
export function hostEntry(verificationStatus) {
  if (verificationStatus === 'approved') {
    return { label: 'Host a session', to: '/create-listing' }
  }
  return { label: 'Become a host', to: '/verify-identity' }
}
