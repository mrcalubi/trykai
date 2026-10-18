export const WHATS_PROVIDED_PRESETS = ['Materials', 'Equipment', 'Food & drinks', 'None']
export const MAX_CUSTOM_PROVIDED = 5
export const MAX_CUSTOM_PROVIDED_CHARS = 40

export function isProvidedPreset(item) {
  return WHATS_PROVIDED_PRESETS.includes(item)
}

export function customProvidedItems(items) {
  return (items ?? []).filter((item) => item && item !== 'None' && !isProvidedPreset(item))
}

export function providedForSave(items) {
  if (!items?.length || items.includes('None')) return []
  return items.filter(Boolean)
}
