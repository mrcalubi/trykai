import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigationType, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { readBrowseCache, writeBrowseCache } from '../lib/browseCache'
import Card from '../components/ui/Card'
import HeroBadge from '../components/HeroBadge'
import Icon from '../components/ui/Icon'
import { categoryIconName } from '../components/ui/categoryIcon'
import { ratingsByListingId } from '../lib/listingRatings'
import { browseFlag, keenCountsById } from '../lib/keen'
import { formatGuestFacingPrice } from '../lib/pricing'
import { listingsForGuestBrowse, sortListingsForBrowse } from '../lib/listingSort'
import { filterNarrows, locationLabel, showLocationFilter, showNewFlags, visibleCategories } from '../lib/browseUi'
import PlanningAreaSelect from '../components/PlanningAreaSelect'
import { REGIONS, regionForPlanningArea } from '../lib/planningAreas'
import { PAGE_LOAD_ERROR, withIssuedAtRetry } from '../lib/pageLoad'
import { publicName } from '../lib/publicName'
import {
  hasSessionThisWeekend,
  isBudgetFriendly,
  nextSessionLabel,
} from '../lib/browseFilters'
import foodArt from '../assets/categories/food.png'
import artsArt from '../assets/categories/arts.png'
import musicArt from '../assets/categories/music.png'
import fitnessArt from '../assets/categories/fitness.png'

const QUICK_FILTERS = [
  { id: 'weekend', label: 'This weekend', matches: (listing) => hasSessionThisWeekend(listing) },
  { id: 'budget', label: 'Under $30', matches: isBudgetFriendly },
]

const TRUST_POINTS = [
  { icon: 'shield', label: 'ID-verified hosts' },
  { icon: 'wallet', label: 'Most sessions under S$30' },
  { icon: 'pin', label: 'Exact address after booking' },
]

const STEPS = [
  {
    title: 'Pick something new',
    body: 'Browse hands-on sessions by people near you, from latte art to DJing.',
  },
  {
    title: 'Book a verified host',
    body: 'Every host passes an ID check before they can list. Pay by PayNow or Card.',
  },
  {
    title: 'Show up and try it',
    body: 'The exact address arrives once you have booked. Bring yourself, a friend or a date.',
  },
]

function listingHost(listing) {
  const record = Array.isArray(listing.users) ? listing.users[0] : listing.users
  if (!record) return null
  return { name: publicName(record) || '', avatarUrl: record.avatar_url || '' }
}

function SkeletonGrid() {
  return (
    <div className="listings-grid" aria-hidden="true">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="skeleton-card">
          <div className="skeleton skeleton-card__media" />
          <div className="skeleton skeleton-card__line" />
          <div className="skeleton skeleton-card__line skeleton-card__line--short" />
        </div>
      ))}
    </div>
  )
}

function EmptyPanel({ title, icon = 'search', children }) {
  return (
    <div className="empty-panel">
      <span className="empty-panel__icon">
        <Icon name={icon} size={24} />
      </span>
      <p className="empty-panel__title">{title}</p>
      {children}
    </div>
  )
}

function filtersForHome(searchParams, navigationType) {
  const urlCategory = searchParams.get('category')
  if (navigationType === 'POP') {
    const cached = readBrowseCache()
    return {
      category: urlCategory || cached?.filters.category || 'All',
      region: cached?.filters.region || 'All',
      area: cached?.filters.area || '',
      quick: cached?.filters.quick ?? null,
    }
  }
  return {
    category: urlCategory || 'All',
    region: 'All',
    area: '',
    quick: null,
  }
}

export default function Home() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigationType = useNavigationType()
  const [listings, setListings] = useState(() => readBrowseCache()?.listings ?? [])
  const [ratings, setRatings] = useState(() => readBrowseCache()?.ratings ?? {})
  const [keenCounts, setKeenCounts] = useState(() => readBrowseCache()?.keenCounts ?? {})
  const [loading, setLoading] = useState(() => !readBrowseCache())
  const [error, setError] = useState('')
  const [regionFilter, setRegionFilter] = useState(
    () => filtersForHome(searchParams, navigationType).region,
  )
  const [areaFilter, setAreaFilter] = useState(
    () => filtersForHome(searchParams, navigationType).area,
  )
  const [quickFilter, setQuickFilter] = useState(
    () => filtersForHome(searchParams, navigationType).quick,
  )
  const [locationOpen, setLocationOpen] = useState(false)
  const skipEmptyWrite = useRef(!readBrowseCache())
  const categoryFilter = filtersForHome(searchParams, navigationType).category

  useEffect(() => {
    async function fetchListings() {
      const { data, error: fetchError } = await withIssuedAtRetry(() =>
        supabase
          .from('listings')
          .select(
            `
          id,
          title,
          area,
          price_per_person,
          category,
          photo_urls,
          created_at,
          users!host_id (
            display_name,
            avatar_url,
            stripe_payouts_enabled
          ),
          sessions (
            starts_at,
            status
          )
        `
          )
          .eq('is_active', true)
          // RLS already hides other hosts' unapproved listings; this hides your own from browse too.
          .eq('review_status', 'approved')
          .eq('sessions.status', 'open')
          .gt('sessions.starts_at', new Date().toISOString())
          .order('created_at', { ascending: false })
      )

      if (fetchError) {
        if (!readBrowseCache()) {
          setError(PAGE_LOAD_ERROR)
          setListings([])
          setRatings({})
          setKeenCounts({})
        }
        setLoading(false)
        return
      }

      const rows = sortListingsForBrowse(listingsForGuestBrowse(data ?? []))
      const listingIds = rows.map((listing) => listing.id)
      const noDateIds = rows.filter((listing) => !nextSessionLabel(listing)).map((listing) => listing.id)
      let ratingRows = []
      let keenRows = []
      if (listingIds.length > 0) {
        const [ratingResult, keenResult] = await Promise.all([
          supabase.rpc('listing_ratings', { listing_ids: listingIds }),
          noDateIds.length > 0
            ? supabase.rpc('listing_keen_counts', { p_listing_ids: noDateIds })
            : Promise.resolve({ data: [] }),
        ])
        ratingRows = ratingResult.data ?? []
        keenRows = keenResult.data ?? []
      }

      setListings(rows)
      setRatings(ratingsByListingId(ratingRows))
      setKeenCounts(keenCountsById(keenRows))
      setLoading(false)
    }

    fetchListings()
  }, [])

  useEffect(() => {
    if (loading) return
    if (!listings.length && skipEmptyWrite.current) return
    skipEmptyWrite.current = false
    writeBrowseCache({
      listings,
      ratings,
      keenCounts,
      filters: {
        category: categoryFilter,
        region: regionFilter,
        area: areaFilter,
        quick: quickFilter,
      },
    })
  }, [listings, ratings, keenCounts, categoryFilter, regionFilter, areaFilter, quickFilter, loading])

  useEffect(() => {
    function handleClick(event) {
      if (event.defaultPrevented || event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const anchor = event.target.closest?.('a[href]')
      if (!anchor || (anchor.target && anchor.target !== '_self')) return
      let url
      try {
        url = new URL(anchor.getAttribute('href'), window.location.href)
      } catch {
        return
      }
      if (url.origin !== window.location.origin || url.pathname !== '/') return
      if (url.searchParams.get('category')) return
      setRegionFilter('All')
      setAreaFilter('')
      setQuickFilter(null)
      setLocationOpen(false)
      window.scrollTo(0, 0)
    }
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [])

  const categories = useMemo(
    () => visibleCategories(listings, categoryFilter),
    [listings, categoryFilter]
  )
  const activeCategory = categories.includes(categoryFilter) ? categoryFilter : 'All'

  // A quick filter shows only when it would narrow the grid, or while it is on.
  const availableQuickFilters = useMemo(
    () =>
      QUICK_FILTERS.filter(
        (filter) => filter.id === quickFilter || filterNarrows(listings, filter.matches)
      ),
    [listings, quickFilter]
  )
  const locationActive = regionFilter !== 'All' || Boolean(areaFilter)
  const showLocation = locationActive || showLocationFilter(listings)
  const showNew = useMemo(() => showNewFlags(listings), [listings])
  const activeQuick = availableQuickFilters.find((filter) => filter.id === quickFilter) ?? null

  const filteredListings = useMemo(() => {
    return listings.filter((listing) => {
      const matchesCategory =
        activeCategory === 'All' || listing.category === activeCategory
      const matchesRegion =
        regionFilter === 'All' || regionForPlanningArea(listing.area) === regionFilter
      const matchesArea = !areaFilter || listing.area === areaFilter
      const matchesQuick = !activeQuick || activeQuick.matches(listing)
      return matchesCategory && matchesRegion && matchesArea && matchesQuick
    })
  }, [listings, activeCategory, regionFilter, areaFilter, activeQuick])

  function chooseCategory(category) {
    const params = new URLSearchParams(searchParams)
    if (category === 'All') params.delete('category')
    else params.set('category', category)
    setSearchParams(params, { replace: true, preventScrollReset: true })
  }

  function clearFilters() {
    chooseCategory('All')
    clearLocation()
    setQuickFilter(null)
  }

  function clearLocation() {
    setRegionFilter('All')
    setAreaFilter('')
    setLocationOpen(false)
  }

  const isFiltering =
    activeCategory !== 'All' || Boolean(activeQuick) || locationActive

  const showListings = !loading && !error && listings.length > 0
  const categoryBar = showListings ? (
    <div className="category-bar filter-pills" role="group" aria-label="Categories">
      {categories.map((category) => (
        <button
          key={category}
          type="button"
          onClick={() => chooseCategory(category)}
          aria-pressed={activeCategory === category}
          className={`category-tab${activeCategory === category ? ' category-tab--active' : ''}`}
        >
          <Icon name={categoryIconName(category)} size={24} strokeWidth={1.6} />
          <span className="category-tab__label">{category}</span>
        </button>
      ))}
    </div>
  ) : null
  const showFilterChrome =
    showListings &&
    (availableQuickFilters.length > 0 || showLocation || isFiltering)

  return (
    <div className="page page--browse">
      <div className={categoryBar ? 'home-stage home-stage--listed' : 'home-stage'}>
        <section className="home-hero">
          <div className="home-hero__copy">
            <p className="eyebrow">Hands-on sessions across Singapore</p>
            <h1 className="home-hero__title">
              Singapore&apos;s not boring. You just haven&apos;t found{' '}
              <span className="home-hero__mark">your thing</span> yet.
            </h1>
            <p className="home-hero__subtitle">
              Solo, with friends, or on a date. Your next hobby awaits.
            </p>
            <ul className="trust-list" aria-label="Why book on TryKai">
              {TRUST_POINTS.map((point) => (
                <li key={point.label} className="trust-list__item">
                  <Icon name={point.icon} size={18} />
                  {point.label}
                </li>
              ))}
            </ul>
          </div>
          <div className="home-hero__art" aria-hidden="true">
            <img src="/trykai.png" alt="" className="home-hero__mascot" width="400" height="400" />
            <HeroBadge src={foodArt} className="home-hero__badge--1" />
            <HeroBadge src={musicArt} className="home-hero__badge--2" />
            <HeroBadge src={artsArt} className="home-hero__badge--3" />
            <HeroBadge src={fitnessArt} className="home-hero__badge--4" />
          </div>
        </section>
        {categoryBar}
      </div>

      <section id="listings" className="home-browse" aria-labelledby="browse-title">
        {/* No visible heading: the hero already says what this is, and the
            categories start straight under it. Kept for screen readers. */}
        <h2 id="browse-title" className="visually-hidden">
          Find something to try
        </h2>

        {loading && (
          <>
            <p className="visually-hidden" role="status">
              Loading listings…
            </p>
            <SkeletonGrid />
          </>
        )}
        {error && <p className="status-banner--error">{error}</p>}

        {!loading && !error && listings.length === 0 && (
          <EmptyPanel title="No listings yet. Check back soon." icon="calendar">
            <p className="empty-panel__body">
              New hosts are joining every week. Know someone with a skill worth sharing?
            </p>
          </EmptyPanel>
        )}

        {showListings && (
          <>
            {showFilterChrome ? (
            <div className="filters">
              {availableQuickFilters.length > 0 || showLocation ? (
                <div className="filter-strip" role="group" aria-label="Filters">
                  {availableQuickFilters.map((filter) => (
                    <button
                      key={filter.id}
                      type="button"
                      className={`chip${activeQuick?.id === filter.id ? ' chip--active' : ''}`}
                      aria-pressed={activeQuick?.id === filter.id}
                      onClick={() =>
                        setQuickFilter((current) => (current === filter.id ? null : filter.id))
                      }
                    >
                      {filter.label}
                    </button>
                  ))}
                  {showLocation ? (
                    <button
                      type="button"
                      className={`chip${locationActive ? ' chip--active' : ''}`}
                      aria-expanded={locationOpen}
                      aria-controls="location-panel"
                      onClick={() => setLocationOpen((open) => !open)}
                    >
                      <Icon name="pin" size={16} />
                      {locationLabel(regionFilter, areaFilter)}
                      <Icon name="chevronDown" size={14} />
                    </button>
                  ) : null}
                </div>
              ) : null}
              {showLocation && locationOpen ? (
                <div id="location-panel" className="location-panel">
                  <div className="region-select">
                    <Icon name="pin" size={16} />
                    <select
                      value={regionFilter}
                      onChange={(e) => {
                        setRegionFilter(e.target.value)
                        setAreaFilter('')
                      }}
                      className="filter-area"
                      aria-label="Filter by region"
                    >
                      <option value="All">All regions</option>
                      {REGIONS.map((region) => (
                        <option key={region} value={region}>
                          {region}
                        </option>
                      ))}
                    </select>
                  </div>
                  <label className="browse-area">
                    <span className="visually-hidden">Filter by area</span>
                    <PlanningAreaSelect
                      allowEmpty
                      value={areaFilter}
                      onChange={(value) => {
                        setAreaFilter(value)
                        if (value) setLocationOpen(false)
                      }}
                      placeholder="All areas"
                    />
                  </label>
                  {locationActive ? (
                    <button type="button" className="location-panel__clear" onClick={clearLocation}>
                      Anywhere
                    </button>
                  ) : null}
                </div>
              ) : null}
              {isFiltering ? (
                <p className="browse-count">
                  {filteredListings.length} of {listings.length} listing{listings.length === 1 ? '' : 's'}
                </p>
              ) : null}
            </div>
            ) : null}

            {filteredListings.length === 0 ? (
              <EmptyPanel title="No listings match your filters.">
                <button type="button" className="ui-button ui-button--secondary" onClick={clearFilters}>
                  Clear filters
                </button>
              </EmptyPanel>
            ) : (
              <div className="listings-grid">
                {filteredListings.map((listing) => (
                  <Card
                    key={listing.id}
                    mode="browse"
                    to={`/listings/${listing.id}`}
                    image={listing.photo_urls?.[0]}
                    badge={listing.category}
                    title={listing.title}
                    titleLevel={3}
                    // No "No dates yet" here: a card with no dates should still invite a
                    // tap, and the listing page asks for interest instead.
                    metaItems={[listing.area, nextSessionLabel(listing)]}
                    host={listingHost(listing)}
                    price={`${formatGuestFacingPrice(listing.price_per_person)}/person`}
                    rating={ratings[listing.id]?.rating}
                    reviewCount={ratings[listing.id]?.reviewCount}
                    flag={browseFlag(listing, keenCounts[listing.id], undefined, showNew)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </section>

      <section className="how-it-works" aria-labelledby="how-title">
        <p className="eyebrow eyebrow--on-dark">How TryKai works</p>
        <h2 id="how-title" className="how-it-works__title">
          Three steps from bored to booked
        </h2>
        <ol className="how-it-works__steps">
          {STEPS.map((step, index) => (
            <li key={step.title} className="how-it-works__step">
              <span className="how-it-works__number">{String(index + 1).padStart(2, '0')}</span>
              <h3 className="how-it-works__step-title">{step.title}</h3>
              <p className="how-it-works__step-body">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="host-band" aria-labelledby="host-band-title">
        <div>
          <h2 id="host-band-title" className="host-band__title">
            Teach what you love
          </h2>
          <p className="host-band__body">
            Share a skill with a few people at a time, on your own schedule. Verify your ID once
            and get paid out through Stripe.
          </p>
        </div>
        <Link to="/verify-identity" className="ui-button ui-button--secondary ui-button--lg">
          Become a host
          <Icon name="arrowRight" size={18} />
        </Link>
      </section>
    </div>
  )
}
