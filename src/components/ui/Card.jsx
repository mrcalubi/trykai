import { Link } from 'react-router-dom'

function hasRating(rating) {
  return typeof rating === 'number' && !Number.isNaN(rating) && rating > 0
}

function formatRating(rating) {
  return rating.toFixed(1)
}

function hasReviewCount(reviewCount) {
  return typeof reviewCount === 'number' && !Number.isNaN(reviewCount) && reviewCount > 0
}

function RatingMark({ rating, reviewCount }) {
  return (
    <>
      <span className="ui-card__star" aria-hidden="true">
        ★
      </span>{' '}
      {formatRating(rating)}
      {hasReviewCount(reviewCount) ? (
        <span className="ui-card__review-count"> ({reviewCount})</span>
      ) : null}
    </>
  )
}

export default function Card({
  mode = 'booking',
  image,
  imageAlt = '',
  badge,
  title,
  titleLevel = 3,
  meta,
  rating,
  reviewCount,
  price,
  to,
  footer,
  className = '',
  children,
  ...props
}) {
  const isBrowse = mode === 'browse'
  const showMedia = isBrowse || Boolean(image) || Boolean(badge)
  const classes = [
    'ui-card',
    isBrowse ? 'ui-card--browse' : 'ui-card--booking',
    className,
  ]
    .filter(Boolean)
    .join(' ')
  const metaLines = Array.isArray(meta) ? meta.filter(Boolean) : meta ? [meta] : []
  const showRating = hasRating(rating)
  const Title = `h${titleLevel}`
  const Wrapper = isBrowse && to ? Link : 'article'
  const wrapperProps =
    isBrowse && to
      ? { to, className: classes, ...props }
      : { className: classes, ...props }

  const browseMetaLine =
    price || showRating ? (
      <p className="ui-card__meta-line">
        {price ? <span className="ui-card__price-text">{price}</span> : null}
        {showRating ? (
          <span className="ui-card__rating">
            <RatingMark rating={rating} reviewCount={reviewCount} />
          </span>
        ) : null}
      </p>
    ) : null

  const bookingMetaBlock =
    metaLines.length > 0 || showRating ? (
      <div className="ui-card__meta-row">
        {metaLines.length > 0 ? (
          <div className="ui-card__meta-lines">
            {metaLines.map((line) => (
              <p key={line} className="ui-card__meta">
                {line}
              </p>
            ))}
          </div>
        ) : null}
        {showRating ? (
          <p className="ui-card__rating">
            <RatingMark rating={rating} reviewCount={reviewCount} />
          </p>
        ) : null}
      </div>
    ) : null

  return (
    <Wrapper {...wrapperProps}>
      {showMedia ? (
        <div className="ui-card__image-wrap">
          {badge ? <span className="ui-card__badge">{badge}</span> : null}
          {image ? (
            <img src={image} alt={imageAlt} className="ui-card__image" />
          ) : (
            <div className="ui-card__placeholder" aria-hidden="true" />
          )}
        </div>
      ) : null}
      <div className="ui-card__body">
        {title ? <Title className="ui-card__title">{title}</Title> : null}
        {isBrowse ? browseMetaLine : bookingMetaBlock}
        {children}
        {!isBrowse && footer ? <div className="ui-card__footer">{footer}</div> : null}
      </div>
    </Wrapper>
  )
}
