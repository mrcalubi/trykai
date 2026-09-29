import { Link } from 'react-router-dom'
import { formatGuestFacingPrice } from '../lib/pricing'
import { publicName } from '../lib/publicName'

function getHostName(listing) {
  const host = listing.host ?? listing.users
  if (!host) return null
  const record = Array.isArray(host) ? host[0] : host
  return publicName(record) || null
}

export default function ListingCard({ listing }) {
  const photo = listing.photo_urls?.[0]
  const hostName = getHostName(listing)
  const metaLine = [
    hostName,
    listing.area,
    `${formatGuestFacingPrice(listing.price_per_person)}/person`,
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
