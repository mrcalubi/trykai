export function settingsDraft({ fullName, displayName, bio }) {
  return JSON.stringify({ fullName, displayName, bio })
}

function photoFingerprint(photo) {
  return {
    id: photo.id,
    remoteUrl: photo.remoteUrl ?? null,
    file: photo.file ? `${photo.file.name}:${photo.file.size}:${photo.file.lastModified}` : null,
    crop: photo.cropState ?? null,
  }
}

export function listingEditorDraft({
  title,
  description,
  category,
  price,
  maxGuests,
  durationMins,
  groupPricing,
  area,
  fullAddress,
  whatsProvided,
  whatToBring,
  photos,
}) {
  return JSON.stringify({
    title,
    description,
    category,
    price,
    maxGuests,
    durationMins,
    groupPricing,
    area,
    fullAddress,
    whatsProvided,
    whatToBring,
    photos: (photos ?? []).map(photoFingerprint),
  })
}
