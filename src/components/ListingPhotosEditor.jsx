import { useRef, useState } from 'react'
import Cropper from 'react-easy-crop'
import Button from './ui/Button'
import Icon from './ui/Icon'
import { compressImage } from '../lib/compressImage'
import { LISTING_COVER_ASPECT, cropImageToBlob, loadImage } from '../lib/coverCrop'
import { filesToPhotos, movePhoto, snapshotImageFiles } from '../lib/listingPhotos'

const MAX_PHOTOS = 5

export default function ListingPhotosEditor({
  photos,
  onChange,
  max = MAX_PHOTOS,
  pickerRef,
  error,
}) {
  const localInputRef = useRef(null)
  const inputRef = pickerRef ?? localInputRef
  const dragFrom = useRef(null)
  const [cropping, setCropping] = useState(null)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedArea, setCroppedArea] = useState(null)
  const [freeCrop, setFreeCrop] = useState(false)
  const [adding, setAdding] = useState(false)

  const croppingCover = cropping ? photos.findIndex((photo) => photo.id === cropping.id) === 0 : false
  const cropAspect = croppingCover || !freeCrop ? LISTING_COVER_ASPECT : undefined

  async function handleFiles(event) {
    const remaining = max - photos.length
    const files = snapshotImageFiles(event.target.files)
    event.target.value = ''
    if (!files.length || remaining <= 0) return
    setAdding(true)
    try {
      const added = await filesToPhotos(files, remaining)
      onChange([...photos, ...added])
    } catch (error) {
      console.error('ListingPhotosEditor: could not add photos', error)
      onChange([...photos, ...files.map((file) => ({
        id: `${file.name}-${file.lastModified}`,
        file,
        previewUrl: URL.createObjectURL(file),
        remoteUrl: null,
      }))])
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

  function startCrop(photo) {
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    setCroppedArea(null)
    setFreeCrop(false)
    setCropping(photo)
  }

  async function applyCrop() {
    if (!cropping || !croppedArea) return
    const image = await loadImage(cropping.previewUrl)
    const blob = await cropImageToBlob(image, croppedArea)
    const name = croppingCover ? 'cover.jpg' : 'photo.jpg'
    const file = new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() })
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
      {error ? (
        <p className="field-hint" role="status">
          {error}
        </p>
      ) : null}

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
              <div className="preview-item__frame">
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
                <div className="preview-item__strip">
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
                  <span className="preview-item__dot" aria-hidden="true">
                    ·
                  </span>
                  <button
                    type="button"
                    className="preview-item__tool"
                    onClick={() => startCrop(photo)}
                  >
                    Crop
                  </button>
                  {index !== 0 ? (
                    <>
                      <span className="preview-item__dot" aria-hidden="true">
                        ·
                      </span>
                      <button
                        type="button"
                        className="preview-item__tool preview-item__tool--action"
                        onClick={() => setCover(index)}
                      >
                        Set as cover
                      </button>
                    </>
                  ) : null}
                </div>
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
            aria-labelledby="photo-crop-title"
          >
            <p id="photo-crop-title" className="confirm-dialog__copy">
              {croppingCover ? 'Crop the cover to the listing card' : 'Crop this photo'}
            </p>
            {!croppingCover ? (
              <div className="crop-aspect" role="group" aria-label="Crop shape">
                <button
                  type="button"
                  className={`choice-chip${freeCrop ? '' : ' choice-chip--on'}`}
                  aria-pressed={!freeCrop}
                  onClick={() => {
                    setFreeCrop(false)
                    setCrop({ x: 0, y: 0 })
                    setZoom(1)
                  }}
                >
                  4:3
                </button>
                <button
                  type="button"
                  className={`choice-chip${freeCrop ? ' choice-chip--on' : ''}`}
                  aria-pressed={freeCrop}
                  onClick={() => {
                    setFreeCrop(true)
                    setCrop({ x: 0, y: 0 })
                    setZoom(1)
                  }}
                >
                  Free
                </button>
              </div>
            ) : null}
            <div className="cover-crop">
              <Cropper
                image={cropping.previewUrl}
                crop={crop}
                zoom={zoom}
                aspect={cropAspect}
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
