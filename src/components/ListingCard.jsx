import { Link } from 'react-router-dom'

function formatPrice(cents) {
  const dollars = cents / 100
  return dollars % 1 === 0 ? `$${dollars}` : `$${dollars.toFixed(2)}`
}

function getHostName(listing) {
  const host = listing.host ?? listing.users
  if (!host) return null
  if (Array.isArray(host)) return host[0]?.full_name ?? null
  return host.full_name ?? null
}

export default function ListingCard({ listing }) {
  const photo = listing.photo_urls?.[0]
  const hostName = getHostName(listing)
  const metaLine = [
    hostName,
    listing.area,
    `${formatPrice(listing.price_per_person)}/person`,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <Link to={`/listings/${listing.id}`} className="listing-card">
      <div className="listing-card__image-wrap">
        {listing.category && (
          <span className="listing-card__category">{listing.category}</span>
        )}
        {photo ? (
          <img src={photo} alt={listing.title} className="listing-card__image" />
        ) : (
          <div className="listing-card__placeholder" />
        )}
      </div>
      <div className="listing-card__body">
        <h2 className="listing-card__title">{listing.title}</h2>
        {metaLine && <p className="listing-card__meta">{metaLine}</p>}
      </div>
    </Link>
  )
}
