import { useEffect, useId, useState } from 'react'
import Button from './ui/Button'
import PhotoCropDialog from './PhotoCropDialog'
import { compressImage } from '../lib/compressImage'
import { cropImageToBlob, loadImage, revokeIfBlobUrl } from '../lib/coverCrop'
import { HEIC_READ_ERROR, IMAGE_ACCEPT, isHeicFile, isHeicReadError, isImageFile } from '../lib/heicImage'
import {
  AVATAR_ASPECT,
  PHOTO_REMOVED,
  PHOTO_UPDATED,
  REMOVE_PHOTO_CONFIRM,
  saveAvatarUrl,
  uploadAvatarFile,
} from '../lib/avatarPhoto'
import { notifyAccountUpdated } from '../lib/myAccount'

export default function ProfilePhotoFlow({ userId, onAvatarUrlChange, children }) {
  const inputId = useId()
  const [cropSource, setCropSource] = useState(null)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedArea, setCroppedArea] = useState(null)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [status, setStatus] = useState('')
  const [statusKind, setStatusKind] = useState('success')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    return () => {
      if (cropSource?.url) revokeIfBlobUrl(cropSource.url)
    }
  }, [cropSource])

  function setErrorStatus(error) {
    setStatusKind('error')
    setStatus(isHeicReadError(error) ? HEIC_READ_ERROR : error.message || HEIC_READ_ERROR)
  }

  function closeCrop() {
    setCropSource((current) => {
      if (current?.url) revokeIfBlobUrl(current.url)
      return null
    })
    setCroppedArea(null)
  }

  function changePhoto() {
    document.getElementById(inputId)?.click()
  }

  async function handleFiles(event) {
    const file = Array.from(event.target.files ?? []).find(isImageFile)
    event.target.value = ''
    if (!file) return

    setBusy(true)
    setStatus('')
    try {
      const ready = await compressImage(file)
      if (isHeicFile(ready)) throw new Error(HEIC_READ_ERROR)
      const url = URL.createObjectURL(ready)
      setCropSource((current) => {
        if (current?.url) revokeIfBlobUrl(current.url)
        return { url, file: ready }
      })
      setCrop({ x: 0, y: 0 })
      setZoom(1)
      setCroppedArea(null)
    } catch (error) {
      setErrorStatus(error)
    } finally {
      setBusy(false)
    }
  }

  async function applyCrop() {
    if (!cropSource || !croppedArea) return
    setBusy(true)
    try {
      const image = await loadImage(cropSource.url)
      const blob = await cropImageToBlob(image, croppedArea)
      const file = new File([blob], 'avatar.jpg', { type: 'image/jpeg', lastModified: Date.now() })
      const compressed = await compressImage(file)
      if (isHeicFile(compressed)) throw new Error(HEIC_READ_ERROR)
      const publicUrl = await uploadAvatarFile(compressed, userId)
      await saveAvatarUrl(userId, publicUrl)
      onAvatarUrlChange?.(publicUrl)
      notifyAccountUpdated()
      setStatusKind('success')
      setStatus(PHOTO_UPDATED)
      closeCrop()
    } catch (error) {
      console.error('Profile photo upload failed', error)
      setErrorStatus(error)
    } finally {
      setBusy(false)
    }
  }

  function requestRemove() {
    setConfirmRemove(true)
  }

  async function confirmRemovePhoto() {
    setBusy(true)
    try {
      await saveAvatarUrl(userId, null)
      onAvatarUrlChange?.(null)
      notifyAccountUpdated()
      setStatusKind('success')
      setStatus(PHOTO_REMOVED)
      setConfirmRemove(false)
    } catch (error) {
      console.error('Profile photo remove failed', error)
      setErrorStatus(error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <input
        id={inputId}
        type="file"
        accept={IMAGE_ACCEPT}
        aria-label="Profile photo"
        className="visually-hidden"
        onChange={handleFiles}
      />
      {children?.({
        changePhoto,
        removePhoto: requestRemove,
        status,
        statusKind,
        busy,
      })}
      {cropSource ? (
        <PhotoCropDialog
          title="Crop your photo"
          image={cropSource.url}
          aspect={AVATAR_ASPECT}
          cropShape="round"
          crop={crop}
          zoom={zoom}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={(_, area) => setCroppedArea(area)}
          onApply={applyCrop}
          applyDisabled={!croppedArea || busy}
          applyLabel={busy ? 'Saving' : 'Use this crop'}
          onCancel={closeCrop}
        />
      ) : null}
      {confirmRemove ? (
        <RemovePhotoDialog
          busy={busy}
          onConfirm={confirmRemovePhoto}
          onCancel={() => setConfirmRemove(false)}
        />
      ) : null}
    </>
  )
}

function RemovePhotoDialog({ busy, onConfirm, onCancel }) {
  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape' && !busy) {
        event.preventDefault()
        onCancel()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [busy, onCancel])

  return (
    <div className="confirm-dialog-backdrop">
      <div
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="remove-photo-title"
      >
        <p id="remove-photo-title" className="confirm-dialog__copy">
          {REMOVE_PHOTO_CONFIRM}
        </p>
        <div className="confirm-dialog__actions">
          <Button variant="destructive" loading={busy} loadingLabel="Removing" onClick={onConfirm}>
            Remove photo
          </Button>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Keep photo
          </Button>
        </div>
      </div>
    </div>
  )
}
