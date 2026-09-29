import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { firstName } from '../lib/firstName'
import ReviewCard from '../components/ReviewCard'
import Card from '../components/ui/Card'
import { formatGuestFacingPrice } from '../lib/pricing'

function formatHostRating(reviews) {
  if (!reviews?.length) return null
  const average = (reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length).toFixed(1)
  const count = reviews.length
  return `${average} · ${count} ${count === 1 ? 'review' : 'reviews'}`
}

export default function Profile() {
  const { id } = useParams()
  const [profile, setProfile] = useState(null)
  const [listings, setListings] = useState([])
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function fetchProfile() {
      setLoading(true)
      setError('')
      setProfile(null)
      setListings([])
      setReviews([])

      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('id, full_name, avatar_url, verification_status')
        .eq('id', id)
        .single()

      if (userError || !userData) {
        setError(userError?.message || 'Profile not found.')
        setLoading(false)
        return
      }

      setProfile(userData)

      const [listingsResult, reviewsResult] = await Promise.all([
        supabase
          .from('listings')
          .select('id, title, area, price_per_person, category, photo_urls')
          .eq('host_id', id)
          .eq('is_active', true)
          .order('created_at', { ascending: false }),
        supabase.rpc('reviews_for_host', { p_host_id: id }),
      ])

      if (listingsResult.error) {
        setError(listingsResult.error.message)
      } else {
        setListings(listingsResult.data ?? [])
      }

      if (!reviewsResult.error) {
        setReviews(reviewsResult.data ?? [])
      }

      setLoading(false)
    }

    fetchProfile()
  }, [id])

  if (loading) {
    return <p className="status-message">Loading…</p>
  }

  if (error && !profile) {
    return (
      <div className="page page--narrow">
        <p className="error-message">{error}</p>
        <Link to="/">Back to listings</Link>
      </div>
    )
  }

  const givenName = firstName(profile.full_name) || 'Anonymous'
  const hostRating = formatHostRating(reviews)
  const verified = profile.verification_status === 'approved'

  return (
    <div className="page page--detail">
      <header className="profile-header">
        {profile.avatar_url ? (
          <img src={profile.avatar_url} alt="" className="detail-host__avatar" />
        ) : (
          <div className="detail-host__avatar-placeholder">
            {givenName[0]?.toUpperCase() || '?'}
          </div>
        )}
        <div>
          <h1 className="profile-header__name">{givenName}</h1>
          {verified ? <p className="profile-verified">ID verified</p> : null}
          {hostRating ? <p className="detail-host__rating">{hostRating}</p> : null}
        </div>
      </header>

      <section className="detail-section" aria-label="Listings">
        <h2 className="detail-section__title">Listings</h2>
        {listings.length === 0 ? (
          <p className="empty-state">No listings yet.</p>
        ) : (
          <div className="listings-grid">
            {listings.map((listing) => (
              <Card
                key={listing.id}
                mode="browse"
                to={`/listings/${listing.id}`}
                image={listing.photo_urls?.[0]}
                badge={listing.category}
                title={listing.title}
                titleLevel={3}
                price={`${formatGuestFacingPrice(listing.price_per_person)}/person`}
              />
            ))}
          </div>
        )}
      </section>

      <section className="detail-section" aria-label="Reviews">
        <h2 className="detail-section__title">
          Reviews{reviews.length > 0 ? ` (${reviews.length})` : ''}
        </h2>
        {reviews.length === 0 ? (
          <p className="empty-state">No reviews yet.</p>
        ) : (
          <div className="reviews-list">
            {reviews.map((review) => (
              <ReviewCard key={review.id} review={review} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
