import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import Card from '../components/ui/Card'
import { ratingsByListingId } from '../lib/listingRatings'
import { formatGuestFacingPrice } from '../lib/pricing'
import { sortListingsForBrowse } from '../lib/listingSort'
import { REGIONS, regionForPlanningArea } from '../lib/planningAreas'

export default function Home() {
  const [listings, setListings] = useState([])
  const [ratings, setRatings] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [regionFilter, setRegionFilter] = useState('All')

  useEffect(() => {
    async function fetchListings() {
      const { data, error: fetchError } = await supabase
        .from('listings')
        .select(
          `
          id,
          title,
          area,
          price_per_person,
          category,
          photo_urls,
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

      if (fetchError) {
        setError(fetchError.message)
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

  const filteredListings = useMemo(() => {
    return listings.filter((listing) => {
      const matchesCategory =
        activeCategory === 'All' || listing.category === activeCategory
      const matchesRegion =
        regionFilter === 'All' || regionForPlanningArea(listing.area) === regionFilter
      return matchesCategory && matchesRegion
    })
  }, [listings, activeCategory, regionFilter])

  return (
    <div className="page page--browse">
      <header className="hero">
        <h1 className="hero__title">
          Singapore&apos;s not boring. You just haven&apos;t found your thing yet.
        </h1>
        <p className="hero__subtitle">
          Solo, with friends, or on a date — something better than scrolling for the tenth time.
        </p>
      </header>

      {loading && <p className="status-message">Loading listings…</p>}
      {error && <p className="status-message error-message">{error}</p>}

      {!loading && !error && listings.length === 0 && (
        <p className="status-message">No listings yet. Check back soon.</p>
      )}

      {!loading && !error && listings.length > 0 && (
        <>
          <div id="listings" className="filters">
            <div className="filter-pills">
              {categories.map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setCategoryFilter(category)}
                  className={`filter-pill${activeCategory === category ? ' filter-pill--active' : ''}`}
                >
                  {category}
                </button>
              ))}
            </div>
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
          </div>

          {filteredListings.length === 0 ? (
            <p className="status-message">No listings match your filters.</p>
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
                  titleLevel={2}
                  price={`${formatGuestFacingPrice(listing.price_per_person)}/person`}
                  rating={ratings[listing.id]?.rating}
                  reviewCount={ratings[listing.id]?.reviewCount}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
