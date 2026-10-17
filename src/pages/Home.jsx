import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Card from '../components/ui/Card'
import Icon from '../components/ui/Icon'
import { categoryIconName } from '../components/ui/categoryIcon'
import { ratingsByListingId } from '../lib/listingRatings'
import { formatGuestFacingPrice } from '../lib/pricing'
import { sortListingsForBrowse } from '../lib/listingSort'
import { REGIONS, regionForPlanningArea } from '../lib/planningAreas'
import { PAGE_LOAD_ERROR, withIssuedAtRetry } from '../lib/pageLoad'
import { publicName } from '../lib/publicName'
import {
  hasSessionThisWeekend,
  isBudgetFriendly,
  isRecentlyListed,
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
  { icon: 'pin', label: 'Exact address after booking' },
  { icon: 'wallet', label: 'Pay by PayNow or card' },
]

const STEPS = [
  {
    title: 'Pick something new',
    body: 'Browse hands-on sessions by people near you, from latte art to DJing.',
  },
  {
    title: 'Book a verified host',
    body: 'Every host passes an ID check before they can list. Pay by PayNow or card.',
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

function EmptyPanel({ title, children }) {
  return (
    <div className="empty-panel">
      <span className="empty-panel__icon">
        <Icon name="sparkle" size={24} />
      </span>
      <p className="empty-panel__title">{title}</p>
      {children}
    </div>
  )
}

export default function Home() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [listings, setListings] = useState([])
  const [ratings, setRatings] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [categoryFilter, setCategoryFilter] = useState(searchParams.get('category') || 'All')
  const [regionFilter, setRegionFilter] = useState('All')
  const [quickFilter, setQuickFilter] = useState(null)

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
            avatar_url
          ),
          sessions (
            starts_at,
            status
          )
        `
          )
          .eq('is_active', true)
          .eq('sessions.status', 'open')
          .gt('sessions.starts_at', new Date().toISOString())
          .order('created_at', { ascending: false })
      )

      if (fetchError) {
        setError(PAGE_LOAD_ERROR)
        setListings([])
        setRatings({})
        setLoading(false)
        return
      }

      const rows = sortListingsForBrowse(data ?? [])
      const listingIds = rows.map((listing) => listing.id)
      let ratingRows = []
      if (listingIds.length > 0) {
        const { data: ratingData } = await supabase.rpc('listing_ratings', {
          listing_ids: listingIds,
        })
        ratingRows = ratingData ?? []
      }

      setListings(rows)
      setRatings(ratingsByListingId(ratingRows))
      setLoading(false)
    }

    fetchListings()
  }, [])

  const categories = useMemo(() => {
    const unique = [...new Set(listings.map((l) => l.category).filter(Boolean))]
    return ['All', ...unique.sort()]
  }, [listings])

  const activeCategory =
    categoryFilter === 'All' || categories.includes(categoryFilter)
      ? categoryFilter
      : 'All'

  const availableQuickFilters = useMemo(
    () => QUICK_FILTERS.filter((filter) => listings.some(filter.matches)),
    [listings]
  )
  const activeQuick = availableQuickFilters.find((filter) => filter.id === quickFilter) ?? null

  const filteredListings = useMemo(() => {
    return listings.filter((listing) => {
      const matchesCategory =
        activeCategory === 'All' || listing.category === activeCategory
      const matchesRegion =
        regionFilter === 'All' || regionForPlanningArea(listing.area) === regionFilter
      const matchesQuick = !activeQuick || activeQuick.matches(listing)
      return matchesCategory && matchesRegion && matchesQuick
    })
  }, [listings, activeCategory, regionFilter, activeQuick])

  function chooseCategory(category) {
    setCategoryFilter(category)
    const params = new URLSearchParams(searchParams)
    if (category === 'All') params.delete('category')
    else params.set('category', category)
    setSearchParams(params, { replace: true })
  }

  function clearFilters() {
    chooseCategory('All')
    setRegionFilter('All')
    setQuickFilter(null)
  }

  return (
    <div className="page page--browse">
      <section className="home-hero">
        <div className="home-hero__copy">
          <p className="eyebrow">Hands-on sessions across Singapore</p>
          <h1 className="home-hero__title">
            Singapore&apos;s not boring. You just haven&apos;t found{' '}
            <span className="home-hero__mark">your thing</span> yet.
          </h1>
          <p className="home-hero__subtitle">
            Solo, with friends, or on a date — something better than scrolling for the tenth time.
          </p>
          <div className="home-hero__actions">
            <a href="#listings" className="ui-button ui-button--primary ui-button--lg">
              Browse sessions
              <Icon name="arrowDown" size={18} />
            </a>
          </div>
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
          <img src={foodArt} alt="" className="home-hero__badge home-hero__badge--1" loading="lazy" />
          <img src={musicArt} alt="" className="home-hero__badge home-hero__badge--2" loading="lazy" />
          <img src={artsArt} alt="" className="home-hero__badge home-hero__badge--3" loading="lazy" />
          <img src={fitnessArt} alt="" className="home-hero__badge home-hero__badge--4" loading="lazy" />
        </div>
      </section>

      <section id="listings" className="home-browse" aria-labelledby="browse-title">
        <div className="section-head">
          <div>
            <p className="eyebrow">Coming up</p>
            <h2 id="browse-title" className="section-head__title">
              Find something to try
            </h2>
          </div>
          {!loading && !error && listings.length > 0 ? (
            <p className="section-head__count">
              {filteredListings.length} of {listings.length} listing{listings.length === 1 ? '' : 's'}
            </p>
          ) : null}
        </div>

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
          <EmptyPanel title="No listings yet. Check back soon.">
            <p className="empty-panel__body">
              New hosts are joining every week. Know someone with a skill worth sharing?
            </p>
          </EmptyPanel>
        )}

        {!loading && !error && listings.length > 0 && (
          <>
            <div className="filters">
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
              <div className="filters__row">
                {availableQuickFilters.length > 0 ? (
                  <div className="quick-filters" role="group" aria-label="Quick filters">
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
                  </div>
                ) : null}
                <div className="region-select">
                  <Icon name="pin" size={16} />
                  <select
                    value={regionFilter}
                    onChange={(e) => setRegionFilter(e.target.value)}
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
                  <Icon name="chevronDown" size={16} className="region-select__chevron" />
                </div>
              </div>
            </div>

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
                    metaItems={[listing.area, nextSessionLabel(listing)]}
                    host={listingHost(listing)}
                    price={`${formatGuestFacingPrice(listing.price_per_person)}/person`}
                    rating={ratings[listing.id]?.rating}
                    reviewCount={ratings[listing.id]?.reviewCount}
                    flag={isRecentlyListed(listing) ? 'New' : undefined}
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
