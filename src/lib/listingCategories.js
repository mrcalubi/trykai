export const LISTING_CATEGORIES = Object.freeze([
  'Food',
  'Fitness',
  'Arts',
  'Music',
  'Language',
  'Other',
])

export const BROWSE_CATEGORIES = Object.freeze(['All', ...LISTING_CATEGORIES])

export function listingCategoryAreaLine(category, area) {
  return [category, area].filter((part) => Boolean(part && String(part).trim())).join(' · ')
}
