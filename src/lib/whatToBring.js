export const WHAT_TO_BRING_SUGGESTIONS = [
  'Comfortable clothes',
  'Water bottle',
  'Notebook and pen',
]
export const MAX_WHAT_TO_BRING = 5
export const MAX_WHAT_TO_BRING_CHARS = 40

export function normalizeWhatToBringItem(value) {
  return String(value ?? '').trim().slice(0, MAX_WHAT_TO_BRING_CHARS)
}

export function whatToBringForSave(items) {
  const clean = []
  for (const item of items ?? []) {
    const next = normalizeWhatToBringItem(item)
    if (!next || clean.includes(next)) continue
    if (clean.length >= MAX_WHAT_TO_BRING) break
    clean.push(next)
  }
  return clean
}
