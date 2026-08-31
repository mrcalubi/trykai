/**
 * Shared fixture builders. Each returns a fresh object so tests can mutate the
 * result without affecting other tests, and each accepts overrides so a test
 * only has to state the fields it actually cares about.
 */

export const HOUR = 60 * 60 * 1000

export function hoursFromNow(hours) {
  return new Date(Date.now() + hours * HOUR).toISOString()
}

export function makeUser(overrides = {}) {
  return {
    id: 'user-1',
    email: 'guest@example.com',
    full_name: 'Guest One',
    is_host: false,
    verification_status: 'unverified',
    host_strikes: 0,
    ...overrides,
  }
}

export function makeAuthSession(overrides = {}) {
  const user = makeUser(overrides.user)
  return {
    access_token: 'test-access-token',
    ...overrides,
    user,
  }
}

export function makeListing(overrides = {}) {
  return {
    id: 'listing-1',
    title: 'Learn latte art with me',
    description: 'Pull your first rosetta in ninety minutes.',
    category: 'Food',
    area: 'Tiong Bahru',
    price_per_person: 4500,
    photo_urls: ['https://cdn.test/listing-photos/one.jpg'],
    whats_provided: ['Materials'],
    host_id: 'host-1',
    is_active: true,
    users: {
      full_name: 'Mei Ling',
      avatar_url: null,
      stripe_payouts_enabled: true,
    },
    ...overrides,
  }
}

export function makeSession(overrides = {}) {
  return {
    id: 'session-1',
    listing_id: 'listing-1',
    starts_at: hoursFromNow(72),
    duration_mins: 90,
    spots_total: 4,
    spots_remaining: 3,
    status: 'open',
    ...overrides,
  }
}

export function makeBooking(overrides = {}) {
  return {
    id: 'booking-1',
    session_id: 'session-1',
    guest_id: 'user-1',
    guests_count: 1,
    total_amount: 4500,
    platform_fee: 675,
    status: 'confirmed',
    sessions: {
      starts_at: hoursFromNow(72),
      spots_remaining: 3,
      listings: { title: 'Learn latte art with me', host_id: 'host-1' },
    },
    ...overrides,
  }
}

export function makeReview(overrides = {}) {
  return {
    id: 'review-1',
    rating: 5,
    comment: 'Wonderful host.',
    created_at: '2026-03-14T02:00:00.000Z',
    users: { full_name: 'Guest One' },
    ...overrides,
  }
}
