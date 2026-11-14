/**
 * "ang mo kio ave 3" typed by hand reads "Ang Mo Kio Ave 3". Anything with a
 * capital already (OneMap's "12 CLAY ROAD") is shown as the host or OneMap
 * wrote it. Display only: the saved address is never changed.
 */
export function tidyAddressForDisplay(value) {
  const text = String(value ?? '').trim()
  if (!text || text !== text.toLowerCase()) return text
  return text.replace(/\b([a-z])/g, (letter) => letter.toUpperCase())
}
