import { useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { AuthedUserContext } from '../lib/authedUser'
import { publicName } from '../lib/publicName'
import HostRating from '../components/HostRating'
import ReviewCard from '../components/ReviewCard'
import Card from '../components/ui/Card'
import { formatGuestFacingPrice } from '../lib/pricing'
import { ratingsByListingId } from '../lib/listingRatings'
import { PAGE_LOAD_ERROR, withIssuedAtRetry } from '../lib/pageLoad'
import { hostEntry } from '../lib/hostEntry'
import { firstAccountRow } from '../lib/myAccount'
import { profileReportSubject, reportMailto } from '../lib/reportMailto'
import OverflowMenu from '../components/ui/OverflowMenu'
import Bookings from './Bookings'
import Hosting from './Hosting'

const OWN_TABS = ['bookings', 'hosting', 'listings', 'reviews']
const PROFILE_COLUMNS = 'id, display_name, bio, avatar_url, is_host, is_id_verified'
const PROFILE_COLUMNS_WITHOUT_BADGE = 'id, display_name, bio, avatar_url, is_host'

/**
 * 00023 adds generated `is_id_verified`. Until that migration is applied,
 * selecting the column fails the whole profile read. Checkout never asks
 * for it, so a guest can book and only then hit this page.
 */
function verifiedColumnUnavailable(error) {
  const message = String(error?.message ?? '')
  const code = String(error?.code ?? '')
  return (
    code === '42703' ||
    code === 'PGRST204' ||
    code === '42501' ||
    /is_id_verified|schema cache|does not exist|permission denied/i.test(message)
  )
}

function loadPublicProfile(userId, columns) {
  return supabase.from('users').select(columns).eq('id', userId).single()
}

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

function ReviewsList({ reviews, viewerId }) {
  if (reviews.length === 0) {
    return <p className="empty-state">No reviews yet.</p>
  }

  return (
    <div className="reviews-list">
      {reviews.map((review) => (
        <ReviewCard key={review.id} review={review} viewerId={viewerId} />
      ))}
    </div>
  )
}

async function attachReviewerIds(reviews) {
  if (!reviews.length) return reviews
  const { data } = await supabase
    .from('reviews')
    .select('id, reviewer_id')
    .in('id', reviews.map((review) => review.id))
  if (!data?.length) return reviews
  const byId = new Map(data.map((row) => [row.id, row.reviewer_id]))
  return reviews.map((review) => ({
    ...review,
    reviewer_id: review.reviewer_id ?? byId.get(review.id) ?? null,
  }))
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
  // Delete on the Hosting tab soft-deletes the row. A profile fetch that
  // started before that delete can still return the listing; drop those ids.
  const removedListingIds = useRef(new Set())

  function forgetListing(listingId) {
    removedListingIds.current.add(listingId)
    setListings((current) => current.filter((listing) => listing.id !== listingId))
    setRatings((current) => {
      if (!(listingId in current)) return current
      const next = { ...current }
      delete next[listingId]
      return next
    })
  }

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

      let { data: userData, error: userError } = await withIssuedAtRetry(() =>
        loadPublicProfile(id, PROFILE_COLUMNS)
      )

      if (userError && verifiedColumnUnavailable(userError)) {
        const fallback = await loadPublicProfile(id, PROFILE_COLUMNS_WITHOUT_BADGE)
        userData = fallback.data
        userError = fallback.error
      }

      if (userError || !userData) {
        setError(userError ? PAGE_LOAD_ERROR : 'Profile not found.')
        setLoading(false)
        return
      }

      const {
        data: { session },
      } = await supabase.auth.getSession()
      let account = null
      if (session?.user?.id === id) {
        const { data } = await supabase.rpc('my_account')
        account = firstAccountRow(data)
      }

      setProfile({
        ...userData,
        verification_status: account?.verification_status ?? null,
      })

      const [listingsResult, reviewsResult] = await Promise.all([
        supabase
          .from('listings')
          .select('id, title, area, price_per_person, category, photo_urls')
          .eq('host_id', id)
          .eq('is_active', true)
          .eq('review_status', 'approved')
          .order('created_at', { ascending: false }),
        supabase.rpc('reviews_for_host', { p_host_id: id }),
      ])

      if (listingsResult.error) {
        setError(PAGE_LOAD_ERROR)
        setListings([])
        setRatings({})
      } else {
        const rows = (listingsResult.data ?? []).filter(
          (listing) => !removedListingIds.current.has(listing.id),
        )
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
        setReviews(await attachReviewerIds(reviewsResult.data ?? []))
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
  const verified =
    typeof profile.is_id_verified === 'boolean'
      ? profile.is_id_verified
      : profile.verification_status === 'approved'
  const isOwn = viewerId === id
  const about = typeof profile.bio === 'string' ? profile.bio.trim() : ''
  const isHost = Boolean(profile.is_host)
  const hostCta = hostEntry(profile.verification_status)
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
          <div className="profile-header__name-row">
            <h1 className="profile-header__name">{givenName}</h1>
            {!isOwn ? (
              <OverflowMenu
                label="More actions"
                icon="⋮"
                className="ui-overflow--quiet profile-header__menu"
                items={[
                  {
                    label: 'Report profile',
                    href: reportMailto({
                      subject: profileReportSubject(givenName),
                      url: typeof window === 'undefined' ? '' : window.location.href,
                      id: profile.id,
                    }),
                  },
                ]}
              />
            ) : null}
          </div>
          {verified ? <p className="profile-verified">ID verified</p> : null}
          <HostRating reviews={reviews} />
        </div>
        {isOwn ? (
          <Link to="/settings" className="profile-header__settings" aria-label="Settings">
            <SettingsGearIcon />
          </Link>
        ) : null}
      </header>

      {about ? (
        <section className="profile-about" aria-labelledby="profile-about-heading">
          <h2 id="profile-about-heading" className="detail-section__title">
            About
          </h2>
          <p className="profile-about__body">{about}</p>
        </section>
      ) : isOwn ? (
        <p className="profile-about__empty">
          <Link to="/settings">Add a short bio</Link>
        </p>
      ) : null}

      {isOwn ? (
        <>
          <nav className="profile-tabs" aria-label="Profile">
            {tabs.map((tab) => (
              <Link
                key={tab.id}
                replace
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
                <Hosting embedded onListingDeleted={forgetListing} />
              </AuthedUserContext.Provider>
            </div>
          ) : null}

          {activeTab === 'listings' ? (
            <section className="detail-section" aria-label="Listings">
              {!isHost ? (
                <div className="empty-state">
                  <p>Share a skill on TryKai.</p>
                  <Link to={hostCta.to}>{hostCta.label}</Link>
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
              <ReviewsList reviews={reviews} viewerId={viewerId} />
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
            <ReviewsList reviews={reviews} viewerId={viewerId} />
          </section>
        </>
      )}
    </div>
  )
}
