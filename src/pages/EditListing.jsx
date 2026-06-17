import { useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const MAX_PHOTOS = 5

const CATEGORIES = ['Food', 'Fitness', 'Arts', 'Music', 'Language', 'Other']

const SINGAPORE_AREAS = [
  'Ang Mo Kio',
  'Bedok',
  'Bishan',
  'Bukit Batok',
  'Bukit Merah',
  'Bukit Panjang',
  'Bukit Timah',
  'Changi',
  'Choa Chu Kang',
  'Clementi',
  'Downtown Core',
  'Geylang',
  'Hougang',
  'Jurong East',
  'Jurong West',
  'Katong',
  'Marine Parade',
  'Novena',
  'Orchard',
  'Pasir Ris',
  'Punggol',
  'Queenstown',
  'Sembawang',
  'Sengkang',
  'Serangoon',
  'Tampines',
  'Toa Payoh',
  'Woodlands',
  'Yishun',
]

const WHATS_PROVIDED_OPTIONS = ['Materials', 'Equipment', 'Food & drinks', 'None']

function centsToDollars(cents) {
  const dollars = cents / 100
  return dollars % 1 === 0 ? String(dollars) : dollars.toFixed(2)
}

export default function EditListing() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()

  const [authChecked, setAuthChecked] = useState(false)
  const [userId, setUserId] = useState(null)
  const [fetching, setFetching] = useState(true)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [price, setPrice] = useState('')
  const [maxGuests, setMaxGuests] = useState('')
  const [area, setArea] = useState('')
  const [fullAddress, setFullAddress] = useState('')
  const [whatsProvided, setWhatsProvided] = useState([])
  const [existingPhotos, setExistingPhotos] = useState([])
  const [newPhotos, setNewPhotos] = useState([])
  const newPhotosRef = useRef(newPhotos)
  newPhotosRef.current = newPhotos
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const totalPhotos = existingPhotos.length + newPhotos.length

  useEffect(() => {
    async function checkAuth() {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session) {
        navigate('/login', { state: { from: location }, replace: true })
        return
      }

      setUserId(session.user.id)
      setAuthChecked(true)
    }

    checkAuth()
  }, [navigate, location])

  useEffect(() => {
    if (!userId) return

    async function fetchListing() {
      const { data, error: fetchError } = await supabase
        .from('listings')
        .select('*')
        .eq('id', id)
        .eq('host_id', userId)
        .single()

      if (fetchError || !data) {
        setError(fetchError?.message || 'Listing not found.')
        setFetching(false)
        return
      }

      setTitle(data.title)
      setDescription(data.description)
      setCategory(data.category)
      setPrice(centsToDollars(data.price_per_person))
      setMaxGuests(String(data.max_guests))
      setArea(data.area)
      setFullAddress(data.full_address)
      setWhatsProvided(data.whats_provided?.length ? data.whats_provided : [])
      setExistingPhotos(data.photo_urls ?? [])
      setFetching(false)
    }

    fetchListing()
  }, [userId, id])

  useEffect(() => {
    return () => {
      newPhotosRef.current.forEach((photo) => URL.revokeObjectURL(photo.previewUrl))
    }
  }, [])

  function handlePhotoChange(e) {
    const selected = Array.from(e.target.files).filter((file) =>
      file.type.startsWith('image/')
    )
    e.target.value = ''

    if (selected.length === 0) return

    setNewPhotos((prev) => {
      const remaining = MAX_PHOTOS - existingPhotos.length - prev.length
      if (remaining <= 0) return prev

      const toAdd = selected.slice(0, remaining).map((file) => ({
        file,
        previewUrl: URL.createObjectURL(file),
      }))

      return [...prev, ...toAdd]
    })
  }

  function removeExistingPhoto(index) {
    setExistingPhotos((prev) => prev.filter((_, i) => i !== index))
  }

  function removeNewPhoto(index) {
    setNewPhotos((prev) => {
      URL.revokeObjectURL(prev[index].previewUrl)
      return prev.filter((_, i) => i !== index)
    })
  }

  async function uploadNewPhotos() {
    const urls = []

    for (const photo of newPhotos) {
      const ext = photo.file.name.split('.').pop() || 'jpg'
      const path = `${userId}/${crypto.randomUUID()}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('listing-photos')
        .upload(path, photo.file)

      if (uploadError) throw uploadError

      const { data } = supabase.storage.from('listing-photos').getPublicUrl(path)
      urls.push(data.publicUrl)
    }

    return urls
  }

  function handleWhatsProvidedChange(option) {
    if (option === 'None') {
      setWhatsProvided((prev) => (prev.includes('None') ? [] : ['None']))
      return
    }

    setWhatsProvided((prev) => {
      const withoutNone = prev.filter((item) => item !== 'None')
      if (withoutNone.includes(option)) {
        return withoutNone.filter((item) => item !== option)
      }
      return [...withoutNone, option]
    })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    const priceCents = Math.round(parseFloat(price) * 100)
    const guests = parseInt(maxGuests, 10)

    if (!title.trim() || !description.trim() || !category || !area || !fullAddress.trim()) {
      setError('Please fill in all required fields.')
      return
    }

    if (Number.isNaN(priceCents) || priceCents <= 0) {
      setError('Please enter a valid price.')
      return
    }

    if (Number.isNaN(guests) || guests < 1) {
      setError('Max guests must be at least 1.')
      return
    }

    const provided =
      whatsProvided.includes('None') || whatsProvided.length === 0
        ? []
        : whatsProvided

    setLoading(true)

    let photoUrls = [...existingPhotos]
    try {
      if (newPhotos.length > 0) {
        const uploaded = await uploadNewPhotos()
        photoUrls = [...photoUrls, ...uploaded]
      }
    } catch (uploadError) {
      setLoading(false)
      setError(uploadError.message)
      return
    }

    const { error: updateError } = await supabase
      .from('listings')
      .update({
        title: title.trim(),
        description: description.trim(),
        category,
        price_per_person: priceCents,
        max_guests: guests,
        area,
        full_address: fullAddress.trim(),
        whats_provided: provided,
        photo_urls: photoUrls,
      })
      .eq('id', id)
      .eq('host_id', userId)

    setLoading(false)

    if (updateError) {
      setError(updateError.message)
      return
    }

    navigate('/dashboard', {
      replace: true,
      state: { message: 'Listing updated successfully.' },
    })
  }

  if (!authChecked || fetching) {
    return <p className="status-message">Loading…</p>
  }

  if (error && !title) {
    return (
      <div className="page page--narrow page--centered">
        <p className="error-message">{error}</p>
      </div>
    )
  }

  return (
    <div className="page page--form">
      <div className="form-card" style={{ maxWidth: '560px' }}>
        <h1 className="form-card__title">Edit listing</h1>
        <p className="form-card__subtitle">Update your experience details</p>

        <form onSubmit={handleSubmit} className="form">
          <label className="label">
            Title
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Learn latte art with me"
              required
              className="input"
            />
          </label>

          <label className="label">
            Description
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What will guests learn or experience?"
              required
              rows={4}
              className="input input--textarea"
            />
          </label>

          <label className="label">
            Category
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              required
              className="input"
            >
              <option value="">Select a category</option>
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </label>

          <div className="form__row">
            <label className="label">
              Price per person (SGD)
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="20"
                min="1"
                step="0.01"
                required
                className="input"
              />
            </label>

            <label className="label">
              Max guests
              <input
                type="number"
                value={maxGuests}
                onChange={(e) => setMaxGuests(e.target.value)}
                placeholder="4"
                min="1"
                required
                className="input"
              />
            </label>
          </div>

          <label className="label">
            Area
            <select
              value={area}
              onChange={(e) => setArea(e.target.value)}
              required
              className="input"
            >
              <option value="">Select an area</option>
              {SINGAPORE_AREAS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>

          <label className="label">
            Full address
            <input
              type="text"
              value={fullAddress}
              onChange={(e) => setFullAddress(e.target.value)}
              placeholder="Only shown to guests after booking"
              required
              className="input"
            />
            <span className="hint">Hidden from browse — revealed after confirmed booking</span>
          </label>

          <div>
            <label className="label">
              Photos
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handlePhotoChange}
                disabled={totalPhotos >= MAX_PHOTOS}
                className="input"
                style={{ padding: '10px' }}
              />
            </label>
            <span className="hint">
              Up to {MAX_PHOTOS} images ({totalPhotos}/{MAX_PHOTOS})
            </span>

            {totalPhotos > 0 && (
              <div className="preview-grid">
                {existingPhotos.map((url, index) => (
                  <div key={url} className="preview-item">
                    <img src={url} alt="" className="preview-image" />
                    <button
                      type="button"
                      onClick={() => removeExistingPhoto(index)}
                      className="preview-remove"
                      aria-label="Remove photo"
                    >
                      ×
                    </button>
                  </div>
                ))}
                {newPhotos.map((photo, index) => (
                  <div key={photo.previewUrl} className="preview-item">
                    <img src={photo.previewUrl} alt="" className="preview-image" />
                    <button
                      type="button"
                      onClick={() => removeNewPhoto(index)}
                      className="preview-remove"
                      aria-label="Remove photo"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <fieldset className="fieldset">
            <legend className="fieldset__legend">What&apos;s provided</legend>
            <div className="checkboxes">
              {WHATS_PROVIDED_OPTIONS.map((option) => (
                <label key={option} className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={whatsProvided.includes(option)}
                    onChange={() => handleWhatsProvidedChange(option)}
                  />
                  {option}
                </label>
              ))}
            </div>
          </fieldset>

          {error && <p className="error-message">{error}</p>}

          <button type="submit" disabled={loading} className="btn btn--primary">
            {loading ? (newPhotos.length > 0 ? 'Uploading…' : 'Saving…') : 'Save changes'}
          </button>
        </form>
      </div>
    </div>
  )
}
