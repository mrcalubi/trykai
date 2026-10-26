import { useState } from 'react'
import PhotoLightbox from './PhotoLightbox'
import Avatar from './ui/Avatar'
import { hasAvatarPhoto } from '../lib/avatarPhoto'

export default function ViewableAvatar({
  avatarUrl,
  displayName,
  className = '',
  size,
  name,
}) {
  const [open, setOpen] = useState(false)
  const photo = hasAvatarPhoto(avatarUrl) ? avatarUrl.trim() : ''
  const labelName = name || displayName || 'Anonymous'
  const avatar = (
    <Avatar avatarUrl={photo} displayName={displayName} className={className} size={size} />
  )

  if (!photo) return avatar

  return (
    <>
      <button
        type="button"
        className="avatar-photo-button"
        aria-label={`View ${labelName}'s photo`}
        onClick={() => setOpen(true)}
      >
        {avatar}
      </button>
      {open ? (
        <PhotoLightbox
          photos={[photo]}
          title={`${labelName}'s photo`}
          label={`${labelName}'s photo`}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  )
}
