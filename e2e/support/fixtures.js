function hoursFromNow(hours) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()
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
