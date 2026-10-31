import { addonDraftFingerprint } from './listingAddons'

export function settingsDraft({
  fullName,
  displayName,
  bio,
  bannerPreset = null,
  bannerUrl = '',
  instagram = '',
  tiktok = '',
  featuredReviewId = null,
}) {
  return JSON.stringify({
    fullName,
    displayName,
    bio,
    bannerPreset,
    bannerUrl,
    instagram,
    tiktok,
    featuredReviewId,
  })
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
  addons,
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
    addons: (addons ?? []).map(addonDraftFingerprint),
  })
}
