function hoursFromNow(hours) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()
}

export const SIGNED_IN_USER = {
  id: 'e2e-host',
  email: 'kai@example.com',
  password: 'hunter22',
}

/**
 * What Supabase returns from the password grant. The client stores this and
 * answers `getSession()` from it, so the shape has to be complete enough that
 * the session survives the redirect back from the login form.
 */
export function makeAuthSession(user = SIGNED_IN_USER) {
  const now = new Date().toISOString()
  return {
    access_token: 'e2e-access-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: 'e2e-refresh-token',
    user: {
      id: user.id,
      aud: 'authenticated',
      role: 'authenticated',
      email: user.email,
      email_confirmed_at: now,
      confirmed_at: now,
      last_sign_in_at: now,
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      identities: [],
      created_at: now,
      updated_at: now,
    },
  }
}

export const LATTE_ART = {
  id: 'listing-latte',
  title: 'Learn latte art with me',
  description: 'Pull your first rosetta in ninety minutes.',
  category: 'Food',
  area: 'Tiong Bahru',
  price_per_person: 4500,
  photo_urls: [],
  whats_provided: ['Materials'],
  host_id: 'host-1',
  host: { full_name: 'Mei Ling' },
  users: { full_name: 'Mei Ling', avatar_url: null },
}

export const BOXING = {
  id: 'listing-boxing',
  title: 'Boxing basics',
  description: 'Footwork, guard and your first combinations.',
  category: 'Fitness',
  area: 'Bedok',
  price_per_person: 3000,
  photo_urls: [],
  whats_provided: ['Equipment'],
  host_id: 'host-2',
  host: { full_name: 'Arun' },
  users: { full_name: 'Arun', avatar_url: null },
}

export const OPEN_SESSION = {
  id: 'session-1',
  listing_id: 'listing-latte',
  starts_at: hoursFromNow(72),
  duration_mins: 90,
  spots_remaining: 3,
}

export const SOLD_OUT_SESSION = {
  id: 'session-2',
  listing_id: 'listing-latte',
  starts_at: hoursFromNow(96),
  duration_mins: 90,
  spots_remaining: 0,
}
