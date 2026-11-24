/**
 * What the browse page shows, decided from the listings themselves. A filter or
 * label only appears when it changes what the guest sees: with 15 listings,
 * a filter that matches all of them (or none) is just clutter.
 */

import { LISTING_CATEGORIES } from './listingCategories'
import { regionForPlanningArea } from './planningAreas'
import { isRecentlyListed } from './browseFilters'

/** Below this many listings, scanning the grid is quicker than filtering by place. */
export const LOCATION_FILTER_MIN_LISTINGS = 8

/** "All" plus every category that has a listing (and the active one, so it can be cleared). */
export function visibleCategories(listings, activeCategory = 'All') {
  const present = new Set((listings ?? []).map((listing) => listing.category))
  return ['All', ...LISTING_CATEGORIES.filter((c) => present.has(c) || c === activeCategory)]
}

/** True when the filter would keep some listings but not all of them. */
export function filterNarrows(listings, matches) {
  const list = listings ?? []
  const count = list.filter(matches).length
  return count > 0 && count < list.length
}

/**
 * Every area a listing runs in. A listing with several locations (00059)
 * carries `areas` from browse; otherwise its own area.
 */
export function listingAreas(listing) {
  const several = Array.isArray(listing?.areas) ? listing.areas.filter(Boolean) : []
  if (several.length > 1) return [...new Set(several)]
  return listing?.area ? [listing.area] : []
}

/** The card's place: "Tampines +1" for a listing with several locations. */
export function cardAreaLabel(listing) {
  const areas = listingAreas(listing)
  if (areas.length > 1) return `${areas[0]} +${areas.length - 1}`
  return areas[0] ?? ''
}

/** The region and area filters match when one of a listing's places fits both. */
export function matchesPlace(listing, region, area) {
  const areas = listingAreas(listing)
  // A listing with no area still shows when no place filter is on.
  if (areas.length === 0) return region === 'All' && !area
  return areas.some(
    (name) => (region === 'All' || regionForPlanningArea(name) === region) && (!area || name === area),
  )
}

export function showLocationFilter(listings) {
  const list = listings ?? []
  if (list.length < LOCATION_FILTER_MIN_LISTINGS) return false
  const regions = new Set(
    list.flatMap((listing) => listingAreas(listing).map((name) => regionForPlanningArea(name))).filter(Boolean),
  )
  return regions.size >= 2
}

/**
 * "New" means something only while most listings are not new. At launch every
 * listing is, so the label stays off until under half of them are.
 */
export function showNewFlags(listings, now = new Date()) {
  const list = listings ?? []
  if (list.length === 0) return false
  const fresh = list.filter((listing) => isRecentlyListed(listing, now)).length
  return fresh * 2 < list.length
}

/** Location chip text: the area, else the region, else "Anywhere". */
export function locationLabel(region, area) {
  if (area) return area
  if (region && region !== 'All') return region
  return 'Anywhere'
}
