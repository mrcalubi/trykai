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
import {
  LISTING_COVER_ASPECT,
  cropImageToBlob,
  cropSourceUrl,
  loadImage,
  photoIsCropped,
  rememberOriginal,
  resetCroppedPhoto,
  revokeIfBlobUrl,
  revokePhotoUrls,
} from '../lib/coverCrop'
import { filesToPhotos, movePhoto, snapshotImageFiles } from '../lib/listingPhotos'

const MAX_PHOTOS = 5
const NOT_PHOTOS_HINT = 'Those are not photos. Choose images instead.'

function photoLabel(index, isCover) {
  return isCover ? `Photo ${index + 1} (cover)` : `Photo ${index + 1}`
}

function isFileDrag(event) {
  return Array.from(event.dataTransfer?.types || []).includes('Files')
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
  onUndoCrop,
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
          data-photo-menu-for={photo.id}
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
          <div
            className="preview-item__menu"
            role="menu"
            data-photo-menu={photo.id}
            aria-label={photoLabel(index, isCover)}
          >
            <button type="button" role="menuitem" onClick={onCrop}>
              Crop
            </button>
            {!isCover ? (
              <button type="button" role="menuitem" onClick={onMakeCover}>
                Make cover
              </button>
            ) : null}
            {onUndoCrop ? (
              <button type="button" role="menuitem" onClick={onUndoCrop}>
                Undo crop
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
  const dragDepth = useRef(0)
  const [cropping, setCropping] = useState(null)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedArea, setCroppedArea] = useState(null)
  const [adding, setAdding] = useState(false)
  const [menuId, setMenuId] = useState(null)
  const [activeId, setActiveId] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [dropHint, setDropHint] = useState(null)

  const atCap = photos.length >= max
  const activePhoto = photos.find((photo) => photo.id === activeId)
  const croppingPhoto = cropping ? photos.find((photo) => photo.id === cropping.id) ?? cropping : null

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
      const target = event.target
      if (!(target instanceof Element)) {
        setMenuId(null)
        return
      }
      if (target.closest(`[data-photo-menu="${menuId}"]`)) return
      if (target.closest(`[data-photo-menu-for="${menuId}"]`)) return
      setMenuId(null)
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

  async function addImageFiles(fileList) {
    const remaining = max - photos.length
    const files = snapshotImageFiles(fileList)
    if (!files.length) {
      if (fileList && fileList.length) setDropHint(NOT_PHOTOS_HINT)
      return
    }
    if (remaining <= 0) return
    setDropHint(null)
    setAdding(true)
    try {
      const added = await filesToPhotos(files, remaining)
      onChange([...photos, ...added.map(rememberOriginal)])
    } catch (error) {
      console.error('ListingPhotosEditor: could not add photos', error)
      onChange([
        ...photos,
        ...files.slice(0, remaining).map((file) =>
          rememberOriginal({
            id: `${file.name}-${file.lastModified}`,
            file,
            previewUrl: URL.createObjectURL(file),
            remoteUrl: null,
          }),
        ),
      ])
    } finally {
      setAdding(false)
    }
  }

  function handleFiles(event) {
    const files = snapshotImageFiles(event.target.files)
    event.target.value = ''
    addImageFiles(files)
  }

  function handleDragEnter(event) {
    if (!isFileDrag(event)) return
    event.preventDefault()
    event.stopPropagation()
    dragDepth.current += 1
    setDragOver(true)
  }

  function handleDragOver(event) {
    if (!isFileDrag(event)) return
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = atCap || adding ? 'none' : 'copy'
  }

  function handleDragLeave(event) {
    if (!isFileDrag(event)) return
    event.preventDefault()
    event.stopPropagation()
    dragDepth.current -= 1
    if (dragDepth.current <= 0) {
      dragDepth.current = 0
      setDragOver(false)
    }
  }

  function handleDrop(event) {
    if (!isFileDrag(event)) return
    event.preventDefault()
    event.stopPropagation()
    dragDepth.current = 0
    setDragOver(false)
    addImageFiles(event.dataTransfer.files)
  }

  function removeAt(index) {
    const next = [...photos]
    const [removed] = next.splice(index, 1)
    revokePhotoUrls(removed)
    setMenuId(null)
    onChange(next)
  }

  function startCrop(photo) {
    setMenuId(null)
    setCrop(photo.cropState?.crop ?? { x: 0, y: 0 })
    setZoom(photo.cropState?.zoom ?? 1)
    setCroppedArea(null)
    setCropping(photo)
  }

  async function applyCrop() {
    if (!croppingPhoto || !croppedArea) return
    const image = await loadImage(cropSourceUrl(croppingPhoto))
    const blob = await cropImageToBlob(image, croppedArea)
    const fileName = photos[0]?.id === croppingPhoto.id ? 'cover.jpg' : 'photo.jpg'
    const file = new File([blob], fileName, { type: 'image/jpeg', lastModified: Date.now() })
    const compressed = await compressImage(file)
    const previewUrl = URL.createObjectURL(compressed)
    const cropState = { crop, zoom }
    onChange(
      photos.map((photo) => {
        if (photo.id !== croppingPhoto.id) return photo
        if (photo.previewUrl !== photo.originalUrl) revokeIfBlobUrl(photo.previewUrl)
        return { ...photo, file: compressed, previewUrl, cropState }
      }),
    )
    setCropping(null)
  }

  function resetCrop() {
    if (!croppingPhoto || !photoIsCropped(croppingPhoto)) return
    const reset = resetCroppedPhoto(croppingPhoto)
    onChange(photos.map((photo) => (photo.id === reset.id ? reset : photo)))
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    setCroppedArea(null)
    setCropping(reset)
  }

  function undoCrop(photo) {
    setMenuId(null)
    if (!photoIsCropped(photo)) return
    onChange(photos.map((item) => (item.id === photo.id ? resetCroppedPhoto(item) : item)))
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
    <div>
      <label
        className={`photo-drop${dragOver ? ' photo-drop--over' : ''}${atCap || adding ? ' photo-drop--disabled' : ''}`}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <Icon name="camera" size={28} strokeWidth={1.5} />
        <span className="photo-drop__title">{adding ? 'Adding photos…' : 'Add photos'}</span>
        <span className="photo-drop__hint photo-drop__hint--coarse">Tap to choose</span>
        <span className="photo-drop__hint photo-drop__hint--fine">
          Click to choose, or drag photos here
        </span>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          aria-label="Photos"
          onChange={handleFiles}
          disabled={atCap || adding}
          className="visually-hidden"
        />
      </label>
      <p className="hint photo-drop__count">
        Maximum of {max} photos ({photos.length}/{max})
      </p>
      {dropHint ? (
        <p className="field-hint" role="status">
          {dropHint}
        </p>
      ) : null}
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
                    onUndoCrop={photoIsCropped(photo) ? () => undoCrop(photo) : undefined}
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

      {croppingPhoto ? (
        <div className="confirm-dialog-backdrop">
          <div
            className="confirm-dialog confirm-dialog--wide"
            role="dialog"
            aria-modal="true"
            aria-labelledby="photo-crop-title"
          >
            <p id="photo-crop-title" className="confirm-dialog__copy">
              {photos[0]?.id === croppingPhoto.id ? 'Crop the cover' : 'Crop this photo'}
            </p>
            <div className="cover-crop">
              <Cropper
                image={cropSourceUrl(croppingPhoto)}
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
              {photoIsCropped(croppingPhoto) ? (
                <Button variant="secondary" onClick={resetCrop}>
                  Reset to original
                </Button>
              ) : null}
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
