/**
 * What the verify form still needs, in the order it appears on the page, so
 * one message names everything instead of revealing one gap per tap.
 */
export function missingVerificationItems({ idPhoto, selfie, consent }) {
  const missing = []
  if (!idPhoto) missing.push('a photo of your ID')
  if (!selfie) missing.push('a selfie')
  if (!consent) missing.push('a tick in the agreement box')
  return missing
}

export function missingItemsMessage(missing) {
  if (missing.length === 0) return ''
  const list =
    missing.length === 1
      ? missing[0]
      : `${missing.slice(0, -1).join(', ')} and ${missing[missing.length - 1]}`
  return `Still needed: ${list}.`
}
