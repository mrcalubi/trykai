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
import {
  MedalRow,
  ProfileBanner,
  ProfilePill,
  SocialLinks,
  StatCard,
} from '../components/profile/ProfileBits'
import {
  ComingUp,
  FeaturedReviewCard,
  TabCalendar,
} from '../components/profile/ProfileSections'
import { hasAvatarPhoto } from '../lib/avatarPhoto'
import { formatGuestFacingPrice } from '../lib/pricing'
import { ratingsByListingId } from '../lib/listingRatings'
import { PAGE_LOAD_ERROR, withIssuedAtRetry } from '../lib/pageLoad'
import { hostEntry } from '../lib/hostEntry'
import { firstAccountRow } from '../lib/myAccount'
import {
  calendarDayMarks,
  confirmedBookingCount,
  fetchHostOwnSessions,
  hostProfileStats,
  sessionListingTitle,
  sessionsOnDay,
} from '../lib/profileHeader'
import {
  comingUpSessions,
  featuredReview,
  guestMedals,
  hostAreasLine,
  hostMedals,
  joinMonthLabel,
  medalHint,
  profileStatsFromRpc,
  rpcBoolean,
  shortDay,
} from '../lib/profileV2'
import { formatSessionTime } from '../lib/sessionDate'
import { profileReportSubject, reportMailto } from '../lib/reportMailto'
import { SHARE_NOTES, shareOrCopy } from '../lib/share'
import OverflowMenu from '../components/ui/OverflowMenu'
import PageLoader from '../components/PageLoader'
import Bookings from './Bookings'
import Hosting from './Hosting'

const OWN_TABS = ['bookings', 'hosting', 'reviews']
const BASE_COLUMNS = 'id, display_name, bio, avatar_url, is_host'
const PROFILE_COLUMNS = `${BASE_COLUMNS}, is_id_verified`
const PROFILE_V2_COLUMNS = `${PROFILE_COLUMNS}, banner_preset, banner_url, featured_review_id, instagram_handle, tiktok_handle`
const PROFILE_COLUMNS_WITHOUT_BADGE = BASE_COLUMNS
const COMING_UP_DAYS = 30

/**
 * Columns from a migration that has not been applied yet (00023's
 * `is_id_verified`, 00041's banner and socials) fail the whole read.
 * Fall back one step at a time so the profile still opens.
 */
function columnUnavailable(error) {
  const message = String(error?.message ?? '')
  const code = String(error?.code ?? '')
  return (
    code === '42703' ||
    code === 'PGRST204' ||
    code === '42501' ||
    /is_id_verified|banner_|featured_review|_handle|schema cache|does not exist|permission denied/i.test(
      message,
    )
  )
}

function loadPublicProfile(userId, columns) {
  return supabase.from('users').select(columns).eq('id', userId).single()
}

async function loadProfileRow(userId) {
  let result = await withIssuedAtRetry(() => loadPublicProfile(userId, PROFILE_V2_COLUMNS))
  for (const columns of [PROFILE_COLUMNS, PROFILE_COLUMNS_WITHOUT_BADGE]) {
    if (!result.error || !columnUnavailable(result.error)) break
    result = await loadPublicProfile(userId, columns)
  }
  return result
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

function sessionsHeldCount(data) {
  if (typeof data === 'number') return data
  if (Array.isArray(data)) return Number(data[0]) || 0
  return Number(data) || 0
}

function ProfileIconLink({ to, label, icon }) {
  return (
    <Link to={to} className="profile-header__icon-btn" aria-label={label}>
      <span className="profile-header__icon-face">
        <Icon name={icon} size={18} strokeWidth={2} />
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

function ProfileBio({ about, isOwn, isHost }) {
  if (about) return <BioPreview bio={about} lines={3} maxChars={240} />
  if (!isOwn) return null
  return (
    <Link to="/settings#bio" className="profile-header__bio-prompt">
      {isHost
        ? 'Guests book hosts they can picture. Add a short bio →'
        : "Add a short bio so hosts know who's coming →"}
    </Link>
  )
}

function HostStats({ isOwn, reviews, sessionsHeld, stats, nextSession }) {
  const { average, reviewCount } = hostProfileStats(reviews)
  const held = Number(sessionsHeld) || 0
  const cards = []

  if (reviewCount > 0 && average != null) {
    cards.push(
      <StatCard
        key="reviews"
        tone="green"
        value={`${average.toFixed(1)} ★`}
        label={`${reviewCount} ${reviewCount === 1 ? 'review' : 'reviews'}`}
      />,
    )
  } else if (isOwn) {
    cards.push(
      <StatCard
        key="reviews"
        tone="green"
        placeholder
        value="No reviews yet"
        label="Your first guests rate you here"
      />,
    )
  }

  if (held > 0) {
    cards.push(
      <StatCard key="held" tone="blue" icon="calendarCheck" value={held} label="Sessions held" />,
    )
  } else if (isOwn) {
    const booked = nextSession ? confirmedBookingCount(nextSession) : 0
    cards.push(
      <StatCard
        key="held"
        tone="blue"
        placeholder
        value="First session"
        label={
          nextSession
            ? `${shortDay(nextSession.starts_at)}${booked > 0 ? ` · ${booked} booked` : ''}`
            : 'Add your first dates'
        }
      />,
    )
  }

  if (isOwn && stats) {
    cards.push(
      <StatCard key="repeat" tone="private" icon="repeat" locked value={stats.repeatGuests} label="Repeat guests" />,
      <StatCard key="hosted" tone="private" icon="users" locked value={stats.guestsHosted} label="Guests hosted" />,
    )
  }

  if (cards.length === 0) return null

  return (
    <div className="profile-stats">
      <div
        className={isOwn ? `stat-grid stat-grid--${cards.length}` : 'stat-grid stat-grid--compact'}
        data-testid="profile-stats"
      >
        {cards}
      </div>
      {isOwn && stats ? <PrivateNote /> : null}
    </div>
  )
}

function GuestStats({ stats }) {
  if (!stats) return null
  return (
    <div className="profile-stats">
      <div className="stat-grid stat-grid--3" data-testid="profile-stats">
        <StatCard tone="blue" icon="ticket" value={stats.sessionsAttended} label="Sessions attended" />
        <StatCard tone="coral" icon="compass" value={stats.categoriesTried} label="Things tried" />
        <StatCard tone="green" icon="pen" value={stats.reviewsWritten} label="Reviews written" />
      </div>
      <PrivateNote />
    </div>
  )
}

function PrivateNote() {
  return (
    <p className="profile-stats__note">
      <Icon name="lock" size={12} strokeWidth={2.2} />
      Only you see these
    </p>
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
    <div className="reviews-list profile-reviews">
      {reviews.map((review) => (
        <ReviewCard key={review.id} review={review} viewerId={viewerId} />
      ))}
    </div>
  )
}

function ReviewsHeading({ reviews, level = 'h2' }) {
  const { average, reviewCount } = hostProfileStats(reviews)
  const Tag = level
  return (
    <Tag className="profile-section__title">
      Reviews
      {reviewCount > 0 && average != null ? (
        <>
          {' '}
          <span className="profile-section__rating">{average.toFixed(1)} ★</span>{' '}
          <span className="profile-section__count">
            {reviewCount} {reviewCount === 1 ? 'review' : 'reviews'}
          </span>
        </>
      ) : null}
    </Tag>
  )
}

function HostCalendar({ sessions, listings, nowMs }) {
  const marks = calendarDayMarks(sessions, { publicView: false, now: nowMs })
  const upcoming = sessions.filter((session) => new Date(session.starts_at).getTime() > nowMs)
  const booked = upcoming.filter((session) => confirmedBookingCount(session) > 0).length
  const summary = upcoming.length
    ? `${upcoming.length} upcoming ${upcoming.length === 1 ? 'session' : 'sessions'} · ${booked} booked`
    : 'No upcoming sessions'

  return (
    <TabCalendar
      label="Your hosting calendar"
      marks={marks}
      summary={summary}
      legend="host"
      nowMs={nowMs}
      renderDay={(dateKey) =>
        sessionsOnDay(sessions, dateKey, { publicView: false, now: nowMs }).map((session) => {
          const title = sessionListingTitle(session, listings)
          const count = confirmedBookingCount(session)
          return (
            <li key={session.id ?? `${session.listing_id}-${session.starts_at}`}>
              <span>
                {formatSessionTime(session.starts_at)}
                {title ? ` · ${title}` : ''}
              </span>
              <span className={count > 0 ? 'tab-calendar__tag tab-calendar__tag--booked' : 'tab-calendar__tag'}>
                {count > 0 ? `${count} booked` : 'Open'}
              </span>
            </li>
          )
        })
      }
    />
  )
}

export default function Profile() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  // Only the profile and the public preview flag decide what to load. Tab
  // switches (and Bookings/Hosting query keys) must not reload the card.
  const viewParam = searchParams.get('view')
  const [visitedTabs, setVisitedTabs] = useState(() => new Set())
  const [profile, setProfile] = useState(null)
  const [listings, setListings] = useState([])
  const [sessions, setSessions] = useState([])
  const [openSessions, setOpenSessions] = useState([])
  const [sessionsHeld, setSessionsHeld] = useState(0)
  const [founding, setFounding] = useState(false)
  const [stats, setStats] = useState(null)
  const [ratings, setRatings] = useState({})
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [viewerId, setViewerId] = useState(null)
  const [viewerReady, setViewerReady] = useState(false)
  const [viewingPhoto, setViewingPhoto] = useState(false)
  const [shareNote, setShareNote] = useState('')
  const [nowMs, setNowMs] = useState(0)
  // Delete on the Hosting tab soft-deletes the row. A profile fetch that
  // started before that delete can still return the listing; drop those ids.
  const removedListingIds = useRef(new Set())

  function forgetListing(listingId) {
    removedListingIds.current.add(listingId)
    setListings((current) => current.filter((listing) => listing.id !== listingId))
    setSessions((current) => current.filter((session) => session.listing_id !== listingId))
    setOpenSessions((current) => current.filter((session) => session.listing_id !== listingId))
    setRatings((current) => {
      if (!(listingId in current)) return current
      const next = { ...current }
      delete next[listingId]
      return next
    })
  }

  function hostingSessionsChanged(rows) {
    setSessions((rows ?? []).filter((row) => !removedListingIds.current.has(row.listing_id)))
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
      setSessions([])
      setOpenSessions([])
      setSessionsHeld(0)
      setFounding(false)
      setStats(null)
      setRatings({})
      setReviews([])
      setShareNote('')

      const { data: userData, error: userError } = await loadProfileRow(id)

      if (userError || !userData) {
        setError(userError ? PAGE_LOAD_ERROR : 'Profile not found.')
        setNowMs(Date.now())
        setLoading(false)
        return
      }

      const {
        data: { session },
      } = await supabase.auth.getSession()
      const isOwner = session?.user?.id === id
      let account = null
      if (isOwner) {
        const { data } = await supabase.rpc('my_account')
        account = firstAccountRow(data)
      }

      setProfile({
        ...userData,
        verification_status: account?.verification_status ?? null,
      })

      const viewingOwn = isOwner && viewParam !== 'public'
      const now = Date.now()

      const [listingsResult, reviewsResult, heldResult, foundingResult, statsResult] =
        await Promise.all([
          supabase
            .from('listings')
            .select('id, title, area, price_per_person, category, photo_urls')
            .eq('host_id', id)
            .eq('is_active', true)
            .eq('review_status', 'approved')
            .order('created_at', { ascending: false }),
          supabase.rpc('reviews_for_host', { p_host_id: id }),
          userData.is_host
            ? supabase.rpc('host_sessions_held', { p_host_id: id })
            : Promise.resolve({ data: 0, error: null }),
          userData.is_host
            ? supabase.rpc('host_is_founding', { p_host_id: id })
            : Promise.resolve({ data: false, error: null }),
          viewingOwn
            ? supabase.rpc('my_profile_stats')
            : Promise.resolve({ data: null, error: null }),
        ])

      let listingRows = []
      if (listingsResult.error) {
        setError(PAGE_LOAD_ERROR)
        setListings([])
        setRatings({})
      } else {
        listingRows = (listingsResult.data ?? []).filter(
          (listing) => !removedListingIds.current.has(listing.id),
        )
        setListings(listingRows)
        const listingIds = listingRows.map((listing) => listing.id)
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

      setSessionsHeld(heldResult.error ? 0 : sessionsHeldCount(heldResult.data))
      setFounding(!foundingResult.error && rpcBoolean(foundingResult.data))
      setStats(profileStatsFromRpc(statsResult.data, statsResult.error))

      const listingIds = listingRows.map((listing) => listing.id)

      if (viewingOwn && userData.is_host && listingIds.length > 0) {
        const sessionsResult = await fetchHostOwnSessions(supabase, listingIds)
        setSessions(
          sessionsResult.error
            ? []
            : (sessionsResult.data ?? []).filter(
                (row) => !removedListingIds.current.has(row.listing_id),
              ),
        )
      }

      if (!viewingOwn && userData.is_host && listingIds.length > 0) {
        const until = new Date(now + COMING_UP_DAYS * 24 * 60 * 60 * 1000).toISOString()
        const openResult = await supabase
          .from('sessions')
          .select('id, listing_id, starts_at, spots_remaining, status')
          .in('listing_id', listingIds)
          .eq('status', 'open')
          .gt('starts_at', new Date(now).toISOString())
          .lte('starts_at', until)
          .order('starts_at', { ascending: true })
        setOpenSessions(openResult.error ? [] : (openResult.data ?? []))
      }

      setNowMs(now)
      setLoading(false)
    }

    fetchProfile()
  }, [id, viewParam])

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
  if (isOwn && !visitedTabs.has(activeTab)) {
    setVisitedTabs((current) => new Set(current).add(activeTab))
  }
  const tabs = [
    { id: 'bookings', label: 'Bookings' },
    ...(isHost ? [{ id: 'hosting', label: 'Hosting' }] : []),
    { id: 'reviews', label: 'Reviews' },
  ]
  const previewTo = {
    pathname: `/u/${id}`,
    search: previewSearch(searchParams, activeTab),
  }
  const hostReviews = isHost ? reviews : []
  const reviewCount = hostReviews.length
  const featured = isHost ? featuredReview(hostReviews, profile.featured_review_id) : null
  const areasLine = isHost ? hostAreasLine(listings) : ''
  const hasSocials = Boolean(profile.instagram_handle || profile.tiktok_handle)
  const hasBanner = Boolean(profile.banner_preset || profile.banner_url)
  const upcomingOwn = sessions
    .filter((session) => new Date(session.starts_at).getTime() > nowMs)
    .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))
  const nextSession = upcomingOwn[0] ?? null
  const comingUp = isOwn ? [] : comingUpSessions(openSessions, { now: nowMs, days: COMING_UP_DAYS })
  const medals = isHost
    ? hostMedals({ sessionsHeld, reviews: hostReviews })
    : guestMedals(stats ?? {})
  // Milestones are for the owner; guests see the featured review (design v2).
  const showMedals = isOwn && (isHost || Boolean(stats))
  const hint = isOwn
    ? medalHint(medals, isHost ? sessionsHeld : stats?.sessionsAttended, {
        host: isHost,
        nextSessionLabel: nextSession ? shortDay(nextSession.starts_at) : '',
      })
    : ''
  const showAside = Boolean(featured) || showMedals
  const isNewHost = isHost && reviewCount === 0 && sessionsHeld === 0
  const joined = isOwn && !isHost ? joinMonthLabel(stats?.joinedAt) : ''

  async function shareProfile() {
    const url = `${window.location.origin}/u/${id}`
    const outcome = await shareOrCopy({ url, title: `${givenName} on TryKai` })
    setShareNote(SHARE_NOTES[outcome] ?? '')
  }

  const avatar = isOwn ? (
    <ProfilePhotoFlow
      userId={id}
      onAvatarUrlChange={(nextUrl) =>
        setProfile((current) => (current ? { ...current, avatar_url: nextUrl } : current))
      }
    >
      {({ changePhoto, removePhoto }) => {
        const photo = hasAvatarPhoto(profile.avatar_url)
        return (
          <OverflowMenu
            label="Profile photo"
            align="start"
            className="ui-overflow--avatar"
            icon={
              <ProfileFace showCamera={!photo}>
                <Avatar
                  avatarUrl={profile.avatar_url}
                  displayName={publicName(profile)}
                  fill
                  className="detail-host__avatar"
                />
              </ProfileFace>
            }
            items={[
              ...(photo ? [{ label: 'View photo', onSelect: () => setViewingPhoto(true) }] : []),
              { label: photo ? 'Change photo' : 'Add photo', onSelect: changePhoto },
              ...(photo
                ? [{ label: 'Remove photo', destructive: true, onSelect: removePhoto }]
                : []),
            ]}
          />
        )
      }}
    </ProfilePhotoFlow>
  ) : (
    <ProfileFace>
      <ViewableAvatar
        avatarUrl={profile.avatar_url}
        displayName={publicName(profile)}
        name={givenName}
        fill
        className="detail-host__avatar"
      />
    </ProfileFace>
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
        <ProfileBanner
          preset={profile.banner_preset}
          imageUrl={profile.banner_url}
          className="profile-header__banner"
        >
          {isOwn && !hasBanner ? (
            <Link to="/settings#banner" className="profile-banner__pick">
              <Icon name="image" size={16} strokeWidth={2} />
              Pick a banner
            </Link>
          ) : null}
          <ProfileTools
            isOwn={isOwn}
            isOwner={isOwner}
            givenName={givenName}
            profile={profile}
            previewTo={previewTo}
          />
        </ProfileBanner>

        <div className="profile-header__identity">
          <div className="profile-header__avatar">{avatar}</div>
          <div className="profile-header__who">
            <div className="profile-header__name-row">
              <h1 className="profile-header__name">{givenName}</h1>
              {founding ? <ProfilePill kind="founding" /> : null}
              {verified ? <ProfilePill kind="verified" /> : null}
              {isNewHost ? <ProfilePill kind="new" /> : null}
            </div>
            {areasLine || hasSocials || joined || (isOwn && !hasSocials) ? (
              <div className="profile-header__facts">
                {areasLine ? (
                  <span className="profile-header__fact">
                    <Icon name="pin" size={16} strokeWidth={2} />
                    {areasLine}
                  </span>
                ) : null}
                {joined ? (
                  <span className="profile-header__fact">Exploring TryKai since {joined}</span>
                ) : null}
                <SocialLinks instagram={profile.instagram_handle} tiktok={profile.tiktok_handle} />
                {isOwn && !hasSocials ? (
                  <Link to="/settings#socials" className="profile-header__add-socials">
                    + Add your Instagram or TikTok
                  </Link>
                ) : null}
              </div>
            ) : null}
          </div>
          {!isOwn ? (
            <div className="profile-header__actions">
              <button
                type="button"
                className="profile-header__share"
                aria-label="Share profile"
                onClick={shareProfile}
              >
                <Icon name="share" size={18} strokeWidth={2} />
              </button>
            </div>
          ) : null}
        </div>

        <div className={showAside ? 'profile-header__body' : 'profile-header__body profile-header__body--single'}>
          <div className="profile-header__main">
            {isHost ? (
              <HostStats
                isOwn={isOwn}
                reviews={hostReviews}
                sessionsHeld={sessionsHeld}
                stats={stats}
                nextSession={nextSession}
              />
            ) : isOwn ? (
              <GuestStats stats={stats} />
            ) : null}
            {about || isOwn ? (
              <div className="profile-about">
                <p className="eyebrow profile-about__title">About</p>
                <ProfileBio about={about} isOwn={isOwn} isHost={isHost} />
              </div>
            ) : null}
            {isOwn && !isHost ? (
              <div className="profile-host-cta">
                <span className="profile-host-cta__text">
                  <span className="profile-host-cta__title">Got something you could teach?</span>
                  <span className="profile-host-cta__hint">
                    Most hosts set up their first listing in about 10 minutes.
                  </span>
                </span>
                <Link to={hostCta.to} className="btn btn--secondary profile-host-cta__link">
                  Start hosting
                </Link>
              </div>
            ) : null}
          </div>

          {showAside ? (
            <aside className="profile-header__aside" aria-label="Highlights">
              {isHost ? (
                <FeaturedReviewCard review={featured} isOwn={isOwn} reviewCount={reviewCount} />
              ) : null}
              {showMedals ? (
                <MedalRow
                  medals={medals}
                  hint={hint}
                  onShare={medals.some((medal) => medal.earned) ? shareProfile : null}
                  shareNote={shareNote}
                />
              ) : null}
            </aside>
          ) : null}
        </div>
        {!isOwn && shareNote ? (
          <p className="profile-header__share-note" role="status">
            {shareNote}
          </p>
        ) : null}
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

          {/* Tabs stay mounted once opened, so switching back is instant. */}
          {visitedTabs.has('bookings') ? (
            <div className="profile-tab-panel" hidden={activeTab !== 'bookings'}>
              <AuthedUserContext.Provider value={viewerId}>
                <Bookings embedded hostCta={null} withCalendar />
              </AuthedUserContext.Provider>
            </div>
          ) : null}

          {isHost && visitedTabs.has('hosting') ? (
            <div className="profile-tab-panel profile-tab-layout" hidden={activeTab !== 'hosting'}>
              <aside className="profile-tab-layout__aside">
                <HostCalendar sessions={sessions} listings={listings} nowMs={nowMs} />
              </aside>
              <div className="profile-tab-layout__main">
                <AuthedUserContext.Provider value={viewerId}>
                  <Hosting
                    embedded
                    onListingDeleted={forgetListing}
                    onSessionsChange={hostingSessionsChanged}
                  />
                </AuthedUserContext.Provider>
              </div>
            </div>
          ) : null}

          {visitedTabs.has('reviews') ? (
            <section
              className="profile-section profile-tab-panel"
              aria-label="Reviews"
              hidden={activeTab !== 'reviews'}
            >
              <ReviewsHeading reviews={hostReviews} />
              <ReviewsList reviews={hostReviews} viewerId={viewerId} />
            </section>
          ) : null}
        </>
      ) : (
        <>
          <ComingUp sessions={comingUp} listings={listings} />

          {isHost ? (
            <section className="profile-section" aria-label="Listings">
              <h2 className="profile-section__title">Sessions by {givenName}</h2>
              <ListingCards listings={listings} ratings={ratings} />
            </section>
          ) : null}

          {isHost ? (
            <section id="profile-reviews" className="profile-section" aria-label="Reviews">
              <ReviewsHeading reviews={hostReviews} />
              <ReviewsList reviews={hostReviews} viewerId={viewerId} />
            </section>
          ) : null}
        </>
      )}
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
