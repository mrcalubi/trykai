import { Link } from 'react-router-dom'
import Icon from './Icon'
import { categoryIconName, categoryTint } from './categoryIcon'
import Avatar from './Avatar'

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
  priceUnit,
  length,
  metaItems,
  host,
  flag,
  to,
  footer,
  onImageClick,
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

  const browseMetaItems = Array.isArray(metaItems) ? metaItems.filter(Boolean) : []
  // Area and date, with the rating (or a "New" flag) beside them. A narrow card
  // gives the rating its own line; see .ui-card__info in index.css.
  const browseInfo =
    browseMetaItems.length > 0 || showRating || flag ? (
      <div className="ui-card__info">
        {browseMetaItems.length > 0 ? (
          <p className="ui-card__meta-inline">
            {browseMetaItems.map((item) => (
              <span key={item} className="ui-card__meta-item">
                {item}
              </span>
            ))}
          </p>
        ) : null}
        {showRating ? (
          <span className="ui-card__rating">
            <RatingMark rating={rating} reviewCount={reviewCount} />
          </span>
        ) : flag ? (
          <span className="ui-card__flag">{flag}</span>
        ) : null}
      </div>
    ) : null
  // The all-in price on the left and the session length in a tag on the right,
  // pinned to the bottom of the card so the rows line up across a grid row.
  const browsePriceRow =
    price || length ? (
      <p className="ui-card__price-row">
        {price ? (
          <span className="ui-card__price-text">
            <span className="ui-card__amount">{price}</span>
            {priceUnit ? <span className="ui-card__unit">{priceUnit}</span> : null}
          </span>
        ) : null}
        {length ? (
          <span className="ui-card__length">
            <Icon name="clock" size={12} strokeWidth={2.2} />
            {length}
          </span>
        ) : null}
      </p>
    ) : null

  const hostName = host?.name ?? ''
  const hostFace =
    isBrowse && host && (host.avatarUrl || hostName) ? (
      <span className="ui-card__host" title={hostName || undefined}>
        <Avatar
          avatarUrl={host.avatarUrl}
          displayName={hostName}
          fill
          className={host.avatarUrl ? 'ui-card__host-img' : ''}
        />
      </span>
    ) : null

  const placeholder =
    isBrowse ? (
      <div
        className={`ui-card__placeholder ui-card__placeholder--${categoryTint(badge)}`}
        aria-hidden="true"
      >
        <Icon name={categoryIconName(badge)} size={44} strokeWidth={1.3} />
      </div>
    ) : (
      <div className="ui-card__placeholder" aria-hidden="true" />
    )

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
          {badge && isBrowse ? (
            // Browse shows the category as its icon, so the word does not cover the
            // photo. With no photo the placeholder already shows the same icon.
            image ? (
              <span className="ui-card__badge ui-card__badge--icon" title={badge}>
                <Icon name={categoryIconName(badge)} size={14} strokeWidth={1.9} />
                <span className="visually-hidden">{badge}</span>
              </span>
            ) : (
              <span className="visually-hidden">{badge}</span>
            )
          ) : badge ? (
            <span className="ui-card__badge">{badge}</span>
          ) : null}
          {image ? (
            onImageClick ? (
              <button
                type="button"
                className="ui-card__image-btn"
                onClick={onImageClick}
                aria-label="View photos"
              >
                <img
                  src={image}
                  alt={imageAlt}
                  className="ui-card__image"
                  loading={isBrowse ? 'lazy' : undefined}
                />
              </button>
            ) : (
              <img
                src={image}
                alt={imageAlt}
                className="ui-card__image"
                loading={isBrowse ? 'lazy' : undefined}
              />
            )
          ) : (
            placeholder
          )}
          {hostFace}
        </div>
      ) : null}
      <div className="ui-card__body">
        {title ? <Title className="ui-card__title">{title}</Title> : null}
        {isBrowse ? browseInfo : bookingMetaBlock}
        {children}
        {isBrowse ? browsePriceRow : null}
        {!isBrowse && footer ? <div className="ui-card__footer">{footer}</div> : null}
      </div>
    </Wrapper>
  )
}
