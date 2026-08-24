import { useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { CancellationPolicyInfo } from '../components/CancellationPolicy'

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

export default function CreateListing() {
  const navigate = useNavigate()
  const location = useLocation()

  const [authChecked, setAuthChecked] = useState(false)
  const [userId, setUserId] = useState(null)
  const [verificationStatus, setVerificationStatus] = useState(null)
  const [verificationChecked, setVerificationChecked] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [price, setPrice] = useState('')
  const [maxGuests, setMaxGuests] = useState('')
  const [area, setArea] = useState('')
  const [fullAddress, setFullAddress] = useState('')
  const [whatsProvided, setWhatsProvided] = useState([])
  const [photos, setPhotos] = useState([])
  const photosRef = useRef(photos)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    photosRef.current = photos
  }, [photos])

  const authCheckStarted = useRef(false)

  useEffect(() => {
    // Redirecting changes both `location` and the identity of `navigate`, so
    // without this guard the effect re-runs from /login and stashes /login as
    // the place to return to after signing in.
    if (authCheckStarted.current) return
    authCheckStarted.current = true

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

    async function checkVerification() {
      const { data } = await supabase
        .from('users')
        .select('verification_status')
        .eq('id', userId)
        .single()

      const status = data?.verification_status || 'unverified'
      setVerificationStatus(status)
      setVerificationChecked(true)

      if (status === 'unverified' || status === 'rejected') {
        navigate('/verify-identity', {
          state: {
            message: 'You need to verify your identity before you can host on TryKai.',
          },
          replace: true,
        })
      }
    }

    checkVerification()
  }, [userId, navigate])

  useEffect(() => {
    return () => {
      photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.previewUrl))
    }
  }, [])

  function handlePhotoChange(e) {
    const selected = Array.from(e.target.files).filter((file) =>
      file.type.startsWith('image/')
    )
    e.target.value = ''

    if (selected.length === 0) return

    setPhotos((prev) => {
      const remaining = MAX_PHOTOS - prev.length
      if (remaining <= 0) return prev

      const toAdd = selected.slice(0, remaining).map((file) => ({
        file,
        previewUrl: URL.createObjectURL(file),
      }))

      return [...prev, ...toAdd]
    })
  }

  function removePhoto(index) {
    setPhotos((prev) => {
      URL.revokeObjectURL(prev[index].previewUrl)
      return prev.filter((_, i) => i !== index)
    })
  }

  async function uploadPhotos() {
    const urls = []

    for (const photo of photos) {
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

    let photoUrls = []
    try {
      if (photos.length > 0) {
        photoUrls = await uploadPhotos()
      }
    } catch (uploadError) {
      setLoading(false)
      setError(uploadError.message)
      return
    }

    const { error: listingError } = await supabase.from('listings').insert({
      host_id: userId,
      title: title.trim(),
      description: description.trim(),
      category,
      price_per_person: priceCents,
      max_guests: guests,
      area,
      full_address: fullAddress.trim(),
      whats_provided: provided,
      photo_urls: photoUrls,
      is_active: true,
    })

    if (listingError) {
      setLoading(false)
      setError(listingError.message)
      return
    }

    const { error: hostError } = await supabase
      .from('users')
      .update({ is_host: true })
      .eq('id', userId)

    setLoading(false)

    if (hostError) {
      setError(hostError.message)
      return
    }

    navigate('/dashboard', { replace: true })
  }

  if (!authChecked || !verificationChecked) {
    return <p className="status-message">Loading…</p>
  }

  if (verificationStatus === 'pending') {
    return (
      <div className="page page--form">
        <div className="form-card">
          <h1 className="form-card__title">Verification under review</h1>
          <p className="form-card__subtitle">
            Your identity verification is being reviewed. You&apos;ll be able to create
            listings once you&apos;re approved — usually within 1–2 business days.
          </p>
        </div>
      </div>
    )
  }

  if (verificationStatus !== 'approved') {
    return <p className="status-message">Loading…</p>
  }

  return (
    <div className="page page--form">
      <div className="form-card" style={{ maxWidth: '560px' }}>
        <h1 className="form-card__title">Create a listing</h1>
        <p className="form-card__subtitle">
          Share a skill or experience with guests in Singapore
        </p>

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
                disabled={photos.length >= MAX_PHOTOS}
                className="input"
                style={{ padding: '10px' }}
              />
            </label>
            <span className="hint">
              Up to {MAX_PHOTOS} images ({photos.length}/{MAX_PHOTOS})
            </span>

            {photos.length > 0 && (
              <div className="preview-grid">
                {photos.map((photo, index) => (
                  <div key={photo.previewUrl} className="preview-item">
                    <img src={photo.previewUrl} alt="" className="preview-image" />
                    <button
                      type="button"
                      onClick={() => removePhoto(index)}
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

          <CancellationPolicyInfo />

          <button type="submit" disabled={loading} className="btn btn--primary">
            {loading ? (photos.length > 0 ? 'Uploading…' : 'Creating…') : 'Create listing'}
          </button>
        </form>
      </div>
    </div>
  )
}
