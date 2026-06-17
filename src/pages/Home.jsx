import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import ListingCard from '../components/ListingCard'

export default function Home() {
  const [listings, setListings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [areaFilter, setAreaFilter] = useState('All')

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
          host:users!host_id (
            full_name
          )
        `
        )
        .eq('is_active', true)
        .order('created_at', { ascending: false })

      if (fetchError) {
        setError(fetchError.message)
      } else {
        setListings(data)
      }
      setLoading(false)
    }

    fetchListings()
  }, [])

  const areas = useMemo(() => {
    const unique = [...new Set(listings.map((l) => l.area).filter(Boolean))]
    return unique.sort()
  }, [listings])

  const categories = useMemo(() => {
    const unique = [...new Set(listings.map((l) => l.category).filter(Boolean))]
    return ['All', ...unique.sort()]
  }, [listings])

  useEffect(() => {
    if (categoryFilter !== 'All' && !categories.includes(categoryFilter)) {
      setCategoryFilter('All')
    }
  }, [categories, categoryFilter])

  const filteredListings = useMemo(() => {
    return listings.filter((listing) => {
      const matchesCategory =
        categoryFilter === 'All' || listing.category === categoryFilter
      const matchesArea = areaFilter === 'All' || listing.area === areaFilter
      return matchesCategory && matchesArea
    })
  }, [listings, categoryFilter, areaFilter])

  return (
    <div className="page">
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
                  className={`filter-pill${categoryFilter === category ? ' filter-pill--active' : ''}`}
                >
                  {category}
                </button>
              ))}
            </div>
            <select
              value={areaFilter}
              onChange={(e) => setAreaFilter(e.target.value)}
              className="filter-area"
              aria-label="Filter by area"
            >
              <option value="All">All areas</option>
              {areas.map((area) => (
                <option key={area} value={area}>
                  {area}
                </option>
              ))}
            </select>
          </div>

          {filteredListings.length === 0 ? (
            <p className="status-message">No listings match your filters.</p>
          ) : (
            <div className="listings-grid">
              {filteredListings.map((listing) => (
                <ListingCard key={listing.id} listing={listing} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
