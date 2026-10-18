const CATEGORY_ICONS = {
  All: 'grid',
  Food: 'food',
  Fitness: 'fitness',
  Arts: 'arts',
  Music: 'music',
  Language: 'language',
}

/** The line icon for a listing category; unknown categories share "Other". */
export function categoryIconName(category) {
  return CATEGORY_ICONS[category] ?? 'other'
}

/** CSS modifier for a category's tint, e.g. `food`, falling back to `other`. */
export function categoryTint(category) {
  const key = String(category ?? '').toLowerCase()
  return ['food', 'fitness', 'arts', 'music', 'language'].includes(key) ? key : 'other'
}
