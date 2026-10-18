import { useEffect, useRef, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import Cropper from 'react-easy-crop'
import Button from './ui/Button'
import Icon from './ui/Icon'
import { compressImage } from '../lib/compressImage'
import { LISTING_COVER_ASPECT, cropImageToBlob, loadImage } from '../lib/coverCrop'
import { filesToPhotos, movePhoto, snapshotImageFiles } from '../lib/listingPhotos'

const MAX_PHOTOS = 5

function photoLabel(index, isCover) {
  return isCover ? `Photo ${index + 1} (cover)` : `Photo ${index + 1}`
}

function PhotoTile({
  photo,
  index,
  isCover,
  menuOpen,
  onOpenMenu,
  onCloseMenu,
  onCrop,
  onMakeCover,
  onRemove,
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: photo.id })
  const dragged = useRef(false)
  const { onKeyDown: onSortableKeyDown, ...sortableListeners } = listeners ?? {}

  useEffect(() => {
    if (isDragging) dragged.current = true
  }, [isDragging])

  return (
    <div
      ref={setNodeRef}
      className={`preview-item${isDragging ? ' preview-item--dragging' : ''}`}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <div className="preview-item__frame">
        <button
          type="button"
          className="preview-item__hit"
          aria-label={photoLabel(index, isCover)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          {...attributes}
          {...sortableListeners}
          onClick={() => {
            if (dragged.current) {
              dragged.current = false
              return
            }
            if (menuOpen) onCloseMenu()
            else onOpenMenu()
          }}
          onKeyDown={(event) => {
            if (event.code === 'Enter') {
              event.preventDefault()
              event.stopPropagation()
              if (menuOpen) onCloseMenu()
              else onOpenMenu()
              return
            }
            onSortableKeyDown?.(event)
          }}
        >
          <img src={photo.previewUrl} alt="" className="preview-image" />
          {isCover ? <span className="preview-item__cover">Cover</span> : null}
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="preview-remove"
          aria-label="Remove photo"
        >
          ×
        </button>
        {menuOpen ? (
          <div className="preview-item__menu" role="menu" aria-label={photoLabel(index, isCover)}>
            <button type="button" role="menuitem" onClick={onCrop}>
              Crop
            </button>
            {!isCover ? (
              <button type="button" role="menuitem" onClick={onMakeCover}>
                Make cover
              </button>
            ) : null}
            <button type="button" role="menuitem" onClick={onRemove}>
              Remove
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default function ListingPhotosEditor({
  photos,
  onChange,
  max = MAX_PHOTOS,
  pickerRef,
  error,
}) {
  const localInputRef = useRef(null)
  const inputRef = pickerRef ?? localInputRef
  const rootRef = useRef(null)
  const [cropping, setCropping] = useState(null)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedArea, setCroppedArea] = useState(null)
  const [freeCrop, setFreeCrop] = useState(false)
  const [adding, setAdding] = useState(false)
  const [menuId, setMenuId] = useState(null)
  const [activeId, setActiveId] = useState(null)

  const croppingCover = cropping ? photos.findIndex((photo) => photo.id === cropping.id) === 0 : false
  const cropAspect = croppingCover || !freeCrop ? LISTING_COVER_ASPECT : undefined
  const activePhoto = photos.find((photo) => photo.id === activeId)

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: {
        start: ['Space'],
        cancel: ['Escape'],
        end: ['Space'],
      },
    }),
  )

  useEffect(() => {
    if (!menuId) return undefined
    function onPointerDown(event) {
      if (!rootRef.current?.contains(event.target)) setMenuId(null)
    }
    function onKey(event) {
      if (event.key === 'Escape') setMenuId(null)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuId])

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
    setMenuId(null)
    onChange(next)
  }

  function startCrop(photo) {
    setMenuId(null)
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

  function handleDragEnd({ active, over }) {
    setActiveId(null)
    if (!over || active.id === over.id) return
    const from = photos.findIndex((photo) => photo.id === active.id)
    const to = photos.findIndex((photo) => photo.id === over.id)
    if (from < 0 || to < 0) return
    setMenuId(null)
    onChange(movePhoto(photos, from, to))
  }

  return (
    <div ref={rootRef}>
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
        <>
          <p className="hint photo-reorder-hint">
            Drag to reorder. The first photo is your cover.
          </p>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={({ active }) => {
              setActiveId(active.id)
              setMenuId(null)
            }}
            onDragCancel={() => setActiveId(null)}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={photos.map((photo) => photo.id)} strategy={rectSortingStrategy}>
              <div className="preview-grid">
                {photos.map((photo, index) => (
                  <PhotoTile
                    key={photo.id}
                    photo={photo}
                    index={index}
                    isCover={index === 0}
                    menuOpen={menuId === photo.id}
                    onOpenMenu={() => setMenuId(photo.id)}
                    onCloseMenu={() => setMenuId(null)}
                    onCrop={() => startCrop(photo)}
                    onMakeCover={() => {
                      setMenuId(null)
                      onChange(movePhoto(photos, index, 0))
                    }}
                    onRemove={() => removeAt(index)}
                  />
                ))}
              </div>
            </SortableContext>
            <DragOverlay>
              {activePhoto ? (
                <div className="preview-item preview-item--overlay">
                  <div className="preview-item__frame">
                    <img src={activePhoto.previewUrl} alt="" className="preview-image" />
                  </div>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </>
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
