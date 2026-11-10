import { addonDraftFingerprint } from './listingAddons'
import { sessionTypeDraftFingerprint } from './sessionTypes'

export function settingsDraft({
  fullName,
  displayName,
  bio,
  bannerPreset = null,
  bannerUrl = '',
  instagram = '',
  tiktok = '',
  featuredReviewId = null,
  dayOfPhone = '',
  shareDayOfPhone = false,
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
    dayOfPhone,
    shareDayOfPhone,
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
  arrivalInstructions,
  bookingCutoffHours,
  whatsProvided,
  whatToBring,
  photos,
  addons,
  sessionTypes,
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
    arrivalInstructions,
    bookingCutoffHours,
    whatsProvided,
    whatToBring,
    photos: (photos ?? []).map(photoFingerprint),
    addons: (addons ?? []).map(addonDraftFingerprint),
    sessionTypes: (sessionTypes ?? []).map(sessionTypeDraftFingerprint),
  })
}
