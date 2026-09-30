import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { AuthedUserContext } from '../lib/authedUser'
import { publicName } from '../lib/publicName'
import HostRating from '../components/HostRating'
import ReviewCard from '../components/ReviewCard'
import Card from '../components/ui/Card'
import { formatGuestFacingPrice } from '../lib/pricing'
import { ratingsByListingId } from '../lib/listingRatings'
import Bookings from './Bookings'
import Hosting from './Hosting'

const OWN_TABS = ['bookings', 'hosting', 'listings', 'reviews']

function tabSearch(searchParams, tab) {
  const params = new URLSearchParams(searchParams)
  params.set('tab', tab)
  return `?${params.toString()}`
}

function SettingsGearIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

function ListingCards({ listings, ratings }) {
  if (listings.length === 0) {
    return <p className="empty-state">No listings yet.</p>
  }

  return (
    <div className="listings-grid profile-listings">
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
          rating={ratings[listing.id]?.rating}
          reviewCount={ratings[listing.id]?.reviewCount}
        />
      ))}
    </div>
  )
}

function ReviewsList({ reviews }) {
  if (reviews.length === 0) {
    return <p className="empty-state">No reviews yet.</p>
  }

  return (
    <div className="reviews-list">
      {reviews.map((review) => (
        <ReviewCard key={review.id} review={review} />
      ))}
    </div>
  )
}

export default function Profile() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const [profile, setProfile] = useState(null)
  const [listings, setListings] = useState([])
  const [ratings, setRatings] = useState({})
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [viewerId, setViewerId] = useState(null)
  const [viewerReady, setViewerReady] = useState(false)

  useEffect(() => {
    let cancelled = false

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!cancelled) {
        setViewerId(session?.user?.id ?? null)
        setViewerReady(true)
      }
    })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    async function fetchProfile() {
      setLoading(true)
      setError('')
      setProfile(null)
      setListings([])
      setRatings({})
      setReviews([])

      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('id, display_name, full_name, avatar_url, verification_status, is_host')
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
        setListings([])
        setRatings({})
      } else {
        const rows = listingsResult.data ?? []
        setListings(rows)
        const listingIds = rows.map((listing) => listing.id)
        if (listingIds.length > 0) {
          const { data: ratingRows } = await supabase.rpc('listing_ratings', {
            listing_ids: listingIds,
          })
          setRatings(ratingsByListingId(ratingRows))
        } else {
          setRatings({})
        }
      }

      if (!reviewsResult.error) {
        setReviews(reviewsResult.data ?? [])
      }

      setLoading(false)
    }

    fetchProfile()
  }, [id])

  if (loading || !viewerReady) {
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

  const givenName = publicName(profile) || 'Anonymous'
  const verified = profile.verification_status === 'approved'
  const isOwn = viewerId === id
  const isHost = Boolean(profile.is_host)
  const allowedTabs = isHost ? OWN_TABS : OWN_TABS.filter((tab) => tab !== 'hosting')
  const requestedTab = searchParams.get('tab')
  const activeTab = allowedTabs.includes(requestedTab) ? requestedTab : 'bookings'
  const tabs = [
    { id: 'bookings', label: 'Bookings' },
    ...(isHost ? [{ id: 'hosting', label: 'Hosting' }] : []),
    { id: 'listings', label: 'Listings' },
    { id: 'reviews', label: 'Reviews' },
  ]

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
        <div className="profile-header__copy">
          <h1 className="profile-header__name">{givenName}</h1>
          {verified ? <p className="profile-verified">ID verified</p> : null}
          <HostRating reviews={reviews} />
        </div>
        {isOwn ? (
          <Link to="/settings" className="profile-header__settings" aria-label="Settings">
            <SettingsGearIcon />
          </Link>
        ) : null}
      </header>

      {isOwn ? (
        <>
          <nav className="profile-tabs" aria-label="Profile">
            {tabs.map((tab) => (
              <Link
                key={tab.id}
                to={{ pathname: `/u/${id}`, search: tabSearch(searchParams, tab.id) }}
                className={
                  activeTab === tab.id
                    ? 'profile-tabs__tab profile-tabs__tab--active'
                    : 'profile-tabs__tab'
                }
                aria-current={activeTab === tab.id ? 'page' : undefined}
              >
                {tab.label}
              </Link>
            ))}
          </nav>

          {activeTab === 'bookings' ? (
            <div className="profile-tab-panel">
              <AuthedUserContext.Provider value={viewerId}>
                <Bookings embedded />
              </AuthedUserContext.Provider>
            </div>
          ) : null}

          {activeTab === 'hosting' ? (
            <div className="profile-tab-panel">
              <AuthedUserContext.Provider value={viewerId}>
                <Hosting embedded />
              </AuthedUserContext.Provider>
            </div>
          ) : null}

          {activeTab === 'listings' ? (
            <section className="detail-section" aria-label="Listings">
              {!isHost ? (
                <div className="empty-state">
                  <p>Share a skill on TryKai.</p>
                  <Link to="/create-listing">Become a host</Link>
                </div>
              ) : (
                <ListingCards listings={listings} ratings={ratings} />
              )}
            </section>
          ) : null}

          {activeTab === 'reviews' ? (
            <section className="detail-section" aria-label="Reviews">
              <h2 className="detail-section__title">
                Reviews{reviews.length > 0 ? ` (${reviews.length})` : ''}
              </h2>
              <ReviewsList reviews={reviews} />
            </section>
          ) : null}
        </>
      ) : (
        <>
          <section className="detail-section" aria-label="Listings">
            <h2 className="detail-section__title">Listings</h2>
            <ListingCards listings={listings} ratings={ratings} />
          </section>

          <section className="detail-section" aria-label="Reviews">
            <h2 className="detail-section__title">
              Reviews{reviews.length > 0 ? ` (${reviews.length})` : ''}
            </h2>
            <ReviewsList reviews={reviews} />
          </section>
        </>
      )}
    </div>
  )
}
