import { useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { AuthedUserContext } from '../lib/authedUser'
import { publicName } from '../lib/publicName'
import BioPreview from '../components/BioPreview'
import ReviewCard from '../components/ReviewCard'
import Avatar from '../components/ui/Avatar'
import Card from '../components/ui/Card'
import Icon from '../components/ui/Icon'
import PhotoLightbox from '../components/PhotoLightbox'
import ProfilePhotoFlow from '../components/ProfilePhotoFlow'
import ViewableAvatar from '../components/ViewableAvatar'
import { hasAvatarPhoto } from '../lib/avatarPhoto'
import { formatGuestFacingPrice } from '../lib/pricing'
import { ratingsByListingId } from '../lib/listingRatings'
import { PAGE_LOAD_ERROR, withIssuedAtRetry } from '../lib/pageLoad'
import { hostEntry } from '../lib/hostEntry'
import { firstAccountRow } from '../lib/myAccount'
import { hostProfileStats, teachCategories } from '../lib/profileHeader'
import { profileReportSubject, reportMailto } from '../lib/reportMailto'
import { categoryIconName } from '../components/ui/categoryIcon'
import OverflowMenu from '../components/ui/OverflowMenu'
import VerifiedBadge from '../components/VerifiedBadge'
import PageLoader from '../components/PageLoader'
import Bookings from './Bookings'
import Hosting from './Hosting'

const OWN_TABS = ['bookings', 'hosting', 'reviews']
const PROFILE_COLUMNS = 'id, display_name, bio, avatar_url, is_host, is_id_verified'
const PROFILE_COLUMNS_WITHOUT_BADGE = 'id, display_name, bio, avatar_url, is_host'
const BANNER_MARKS = ['1', '2', '3', '4', '5', '6', '7', '8']

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

function previewSearch(searchParams, tab) {
  const params = new URLSearchParams(searchParams)
  params.set('tab', tab)
  params.set('view', 'public')
  return `?${params.toString()}`
}

function ownerSearch(searchParams) {
  const params = new URLSearchParams(searchParams)
  params.delete('view')
  const query = params.toString()
  return query ? `?${query}` : ''
}

function ProfileBanner() {
  return (
    <div className="profile-header__banner" aria-hidden="true">
      {BANNER_MARKS.map((mark) => (
        <span key={mark} className={`profile-header__mark profile-header__mark--${mark}`} />
      ))}
    </div>
  )
}

function ProfileIconLink({ to, label, icon }) {
  return (
    <Link to={to} className="profile-header__icon-btn" aria-label={label}>
      <span className="profile-header__icon-face">
        <Icon name={icon} size={18} />
      </span>
      <span className="profile-header__tooltip" aria-hidden="true">
        {label}
      </span>
    </Link>
  )
}

function ProfileFace({ children, showCamera = false }) {
  return (
    <span className="profile-header__face">
      {children}
      {showCamera ? (
        <span className="profile-header__camera" aria-hidden="true">
          <Icon name="camera" size={14} />
        </span>
      ) : null}
    </span>
  )
}

function HostStats({ reviews, listings }) {
  const stats = hostProfileStats(reviews, listings)
  if (!stats) return null

  return (
    <dl className="profile-header__stats">
      {stats.average != null ? (
        <div className="profile-header__stat">
          <dt>Rating</dt>
          <dd>
            <span className="profile-header__star" aria-hidden="true">
              ★
            </span>{' '}
            {stats.average.toFixed(1)}
          </dd>
        </div>
      ) : null}
      {stats.reviewCount > 0 ? (
        <div className="profile-header__stat">
          <dt>Reviews</dt>
          <dd>{stats.reviewCount}</dd>
        </div>
      ) : null}
      <div className="profile-header__stat">
        <dt>Live listings</dt>
        <dd>{stats.listingCount}</dd>
      </div>
    </dl>
  )
}

function TeachChips({ listings }) {
  const categories = teachCategories(listings)
  if (!categories.length) return null

  return (
    <div className="profile-header__teaches">
      <p className="profile-header__teaches-label">Teaches</p>
      <ul className="profile-header__chips">
        {categories.map((category) => (
          <li key={category} className="profile-header__chip">
            <Icon name={categoryIconName(category)} size={14} />
            {category}
          </li>
        ))}
      </ul>
    </div>
  )
}

function ProfileHeaderCopy({ givenName, verified, reviews, listings, about, isOwn, isHost }) {
  const needsBio = isOwn && !about

  return (
    <div className="profile-header__copy">
      <h1 className="profile-header__name">{givenName}</h1>
      {verified ? <VerifiedBadge /> : null}
      {isHost ? <HostStats reviews={reviews} listings={listings} /> : null}
      {isHost ? <TeachChips listings={listings} /> : null}
      {about ? <BioPreview bio={about} lines={3} maxChars={240} /> : null}
      {needsBio ? (
        <Link to="/settings#bio" className="profile-header__bio-prompt">
          {isHost
            ? 'Guests book hosts they can picture. Add a short bio →'
            : 'Add a short bio so guests know who you are →'}
        </Link>
      ) : null}
    </div>
  )
}

function ProfileTools({ isOwn, isOwner, givenName, profile, previewTo }) {
  if (isOwn) {
    return (
      <div className="profile-header__tools">
        <ProfileIconLink to="/settings" label="Edit profile" icon="pencil" />
        <ProfileIconLink to={previewTo} label="See how guests see you" icon="eye" />
      </div>
    )
  }

  if (isOwner) return null

  return (
    <div className="profile-header__tools">
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
    </div>
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
  const [viewingPhoto, setViewingPhoto] = useState(false)
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
    return <PageLoader />
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
  const isOwner = viewerId === id
  const publicPreview = isOwner && searchParams.get('view') === 'public'
  const isOwn = isOwner && !publicPreview
  const about = typeof profile.bio === 'string' ? profile.bio.trim() : ''
  const isHost = Boolean(profile.is_host)
  const hostCta = hostEntry(profile.verification_status)
  const allowedTabs = isHost ? OWN_TABS : OWN_TABS.filter((tab) => tab !== 'hosting')
  const requestedTab = searchParams.get('tab')
  const activeTab = allowedTabs.includes(requestedTab) ? requestedTab : 'bookings'
  const tabs = [
    { id: 'bookings', label: 'Bookings' },
    ...(isHost ? [{ id: 'hosting', label: 'Hosting' }] : []),
    { id: 'reviews', label: 'Reviews' },
  ]
  const previewTo = {
    pathname: `/u/${id}`,
    search: previewSearch(searchParams, activeTab),
  }
  const headerCopy = (
    <ProfileHeaderCopy
      givenName={givenName}
      verified={verified}
      reviews={reviews}
      listings={listings}
      about={about}
      isOwn={isOwn}
      isHost={isHost}
    />
  )

  return (
    <div className="page page--profile">
      {publicPreview ? (
        <div className="profile-preview-bar" role="status">
          <span>This is how guests see your profile</span>
          <Link to={{ pathname: `/u/${id}`, search: ownerSearch(searchParams) }}>
            Back to your profile
          </Link>
        </div>
      ) : null}
      <header className="profile-header">
        <ProfileBanner />
        <ProfileTools
          isOwn={isOwn}
          isOwner={isOwner}
          givenName={givenName}
          profile={profile}
          previewTo={previewTo}
        />
        <div className="profile-header__body">
          {isOwn ? (
            <ProfilePhotoFlow
              userId={id}
              onAvatarUrlChange={(next) =>
                setProfile((current) => (current ? { ...current, avatar_url: next } : current))
              }
            >
              {({ changePhoto, removePhoto }) => {
                const photo = hasAvatarPhoto(profile.avatar_url)
                return (
                  <>
                    <OverflowMenu
                      label="Profile photo"
                      align="start"
                      className="ui-overflow--avatar"
                      icon={
                        <ProfileFace showCamera={!photo}>
                          <Avatar
                            avatarUrl={profile.avatar_url}
                            displayName={publicName(profile)}
                            className="detail-host__avatar"
                          />
                        </ProfileFace>
                      }
                      items={[
                        ...(photo
                          ? [{ label: 'View photo', onSelect: () => setViewingPhoto(true) }]
                          : []),
                        { label: photo ? 'Change photo' : 'Add photo', onSelect: changePhoto },
                        ...(photo
                          ? [{ label: 'Remove photo', destructive: true, onSelect: removePhoto }]
                          : []),
                      ]}
                    />
                    <ProfileHeaderCopy
                      givenName={givenName}
                      verified={verified}
                      reviews={reviews}
                      listings={listings}
                      about={about}
                      isOwn={isOwn}
                      isHost={isHost}
                    />
                  </>
                )
              }}
            </ProfilePhotoFlow>
          ) : (
            <>
              <ProfileFace>
                <ViewableAvatar
                  avatarUrl={profile.avatar_url}
                  displayName={publicName(profile)}
                  name={givenName}
                  className="detail-host__avatar"
                />
              </ProfileFace>
              {headerCopy}
            </>
          )}
        </div>
      </header>

      {viewingPhoto && hasAvatarPhoto(profile.avatar_url) ? (
        <PhotoLightbox
          photos={[profile.avatar_url]}
          title={`${givenName}'s photo`}
          label={`${givenName}'s photo`}
          onClose={() => setViewingPhoto(false)}
        />
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
                <Bookings embedded hostCta={isHost ? null : hostCta} />
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
