import { useRef, useState } from 'react'
import Cropper from 'react-easy-crop'
import Button from './ui/Button'
import Icon from './ui/Icon'
import { compressImage } from '../lib/compressImage'
import { LISTING_COVER_ASPECT, cropImageToBlob, loadImage } from '../lib/coverCrop'
import { filesToPhotos, movePhoto } from '../lib/listingPhotos'

const MAX_PHOTOS = 5

export default function ListingPhotosEditor({ photos, onChange, max = MAX_PHOTOS, pickerRef }) {
  const localInputRef = useRef(null)
  const inputRef = pickerRef ?? localInputRef
  const dragFrom = useRef(null)
  const [cropping, setCropping] = useState(null)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedArea, setCroppedArea] = useState(null)
  const [adding, setAdding] = useState(false)

  async function handleFiles(event) {
    const remaining = max - photos.length
    const files = event.target.files
    event.target.value = ''
    if (!files?.length || remaining <= 0) return
    setAdding(true)
    try {
      const added = await filesToPhotos(files, remaining)
      onChange([...photos, ...added])
    } finally {
      setAdding(false)
    }
  }

  function removeAt(index) {
    const next = [...photos]
    const [removed] = next.splice(index, 1)
    if (removed?.file && removed.previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(removed.previewUrl)
    }
    onChange(next)
  }

  function setCover(index) {
    onChange(movePhoto(photos, index, 0))
  }

  function shift(index, direction) {
    onChange(movePhoto(photos, index, index + direction))
  }

  async function applyCrop() {
    if (!cropping || !croppedArea) return
    const image = await loadImage(cropping.previewUrl)
    const blob = await cropImageToBlob(image, croppedArea)
    const file = new File([blob], 'cover.jpg', { type: 'image/jpeg', lastModified: Date.now() })
    const compressed = await compressImage(file)
    const previewUrl = URL.createObjectURL(compressed)
    onChange(
      photos.map((photo) => {
        if (photo.id !== cropping.id) return photo
        if (photo.file && photo.previewUrl.startsWith('blob:')) URL.revokeObjectURL(photo.previewUrl)
        return { ...photo, file: compressed, previewUrl, remoteUrl: null }
      }),
    )
    setCropping(null)
  }

  return (
    <div>
      <label className="photo-drop">
        <Icon name="camera" size={28} strokeWidth={1.5} />
        <span className="photo-drop__title">{adding ? 'Adding photos…' : 'Photos'}</span>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFiles}
          disabled={photos.length >= max || adding}
          className="visually-hidden"
        />
      </label>
      <p className="hint photo-drop__count">
        Maximum of {max} photos ({photos.length}/{max})
      </p>

      {photos.length > 0 ? (
        <div className="preview-grid">
          {photos.map((photo, index) => (
            <div
              key={photo.id}
              className="preview-item"
              draggable
              onDragStart={() => {
                dragFrom.current = index
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (dragFrom.current == null) return
                onChange(movePhoto(photos, dragFrom.current, index))
                dragFrom.current = null
              }}
            >
              <img src={photo.previewUrl} alt="" className="preview-image" />
              {index === 0 ? <span className="preview-item__cover">Cover</span> : null}
              <button
                type="button"
                onClick={() => removeAt(index)}
                className="preview-remove"
                aria-label="Remove photo"
              >
                ×
              </button>
              <div className="preview-item__tools">
                <button
                  type="button"
                  className="preview-item__tool"
                  aria-label="Move photo left"
                  disabled={index === 0}
                  onClick={() => shift(index, -1)}
                >
                  ←
                </button>
                <button
                  type="button"
                  className="preview-item__tool"
                  aria-label="Move photo right"
                  disabled={index === photos.length - 1}
                  onClick={() => shift(index, 1)}
                >
                  →
                </button>
                {index === 0 ? (
                  <button
                    type="button"
                    className="preview-item__tool"
                    onClick={() => {
                      setCrop({ x: 0, y: 0 })
                      setZoom(1)
                      setCroppedArea(null)
                      setCropping(photo)
                    }}
                  >
                    Crop cover
                  </button>
                ) : (
                  <button type="button" className="preview-item__tool" onClick={() => setCover(index)}>
                    Set as cover
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {cropping ? (
        <div className="confirm-dialog-backdrop">
          <div
            className="confirm-dialog confirm-dialog--wide"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cover-crop-title"
          >
            <p id="cover-crop-title" className="confirm-dialog__copy">
              Crop the cover to the listing card
            </p>
            <div className="cover-crop">
              <Cropper
                image={cropping.previewUrl}
                crop={crop}
                zoom={zoom}
                aspect={LISTING_COVER_ASPECT}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_, area) => setCroppedArea(area)}
              />
            </div>
            <div className="confirm-dialog__actions">
              <Button variant="primary" onClick={applyCrop} disabled={!croppedArea}>
                Use this crop
              </Button>
              <Button variant="secondary" onClick={() => setCropping(null)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
