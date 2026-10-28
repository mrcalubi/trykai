/** Last successful Home grid. Survives remount so back does not land on a short page. */
export const BROWSE_CACHE_TTL_MS = 5 * 60 * 1000

let cache = null

function normalizeFilters(filters = {}) {
  return {
    category: filters.category || 'All',
    region: filters.region || 'All',
    area: typeof filters.area === 'string' ? filters.area : '',
    quick: filters.quick ?? null,
  }
}

export function readBrowseCache(now = Date.now()) {
  if (!cache) return null
  if (now - cache.savedAt >= BROWSE_CACHE_TTL_MS) return null
  return {
    listings: cache.listings,
    ratings: cache.ratings,
    keenCounts: cache.keenCounts,
    filters: cache.filters,
  }
}

export function writeBrowseCache(snapshot, now = Date.now()) {
  cache = {
    listings: snapshot.listings ?? [],
    ratings: snapshot.ratings ?? {},
    keenCounts: snapshot.keenCounts ?? {},
    filters: normalizeFilters(snapshot.filters),
    savedAt: now,
  }
}

export function writeBrowseFilters(filters, now = Date.now()) {
  if (!cache) return
  cache = {
    ...cache,
    filters: normalizeFilters({ ...cache.filters, ...filters }),
    savedAt: now,
  }
}

export function clearBrowseCache() {
  cache = null
}
