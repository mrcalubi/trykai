import Icon from '../ui/Icon'
import { bannerPreset, SOCIALS, socialUrl } from '../../lib/profileV2'

/* Banner ------------------------------------------------------------------ */

export function ProfileBanner({ preset, imageUrl, children, className = '' }) {
  const colours = bannerPreset(preset)
  const photo = typeof imageUrl === 'string' && imageUrl.trim() ? imageUrl.trim() : ''
  return (
    <div
      className={['profile-banner', photo ? 'profile-banner--photo' : '', className]
        .filter(Boolean)
        .join(' ')}
      data-banner={photo ? 'photo' : colours.id}
      style={{ '--banner-bg': colours.bg, '--banner-a': colours.a, '--banner-b': colours.b }}
    >
      {photo ? (
        <img className="profile-banner__photo" src={photo} alt="" />
      ) : (
        <>
          <span className="profile-banner__circle profile-banner__circle--a" aria-hidden="true" />
          <span className="profile-banner__circle profile-banner__circle--b" aria-hidden="true" />
          <span className="profile-banner__circle profile-banner__circle--c" aria-hidden="true" />
        </>
      )}
      {children}
    </div>
  )
}

/* Pills ------------------------------------------------------------------- */

function CrownGlyph() {
  return (
    <svg className="profile-pill__glyph" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M3 18 2 7l5.5 4L12 4l4.5 7L22 7l-1 11z"
        fill="#EC8873"
        stroke="#A8432F"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M3 21h18" fill="none" stroke="#A8432F" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function ShieldGlyph() {
  return (
    <svg className="profile-pill__glyph" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
        fill="#6E80B0"
        stroke="#3D4C6E"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="m9 12 2 2 4-4"
        fill="none"
        stroke="#FBFAF6"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function ProfilePill({ kind, small = false }) {
  const size = small ? ' profile-pill--small' : ''
  if (kind === 'founding') {
    return (
      <span className={`profile-pill profile-pill--founding${size}`}>
        <CrownGlyph />
        Founding host
      </span>
    )
  }
  if (kind === 'verified') {
    return (
      <span className={`profile-pill profile-pill--verified${size}`}>
        <ShieldGlyph />
        ID verified
      </span>
    )
  }
  if (kind === 'new') {
    return <span className={`profile-pill profile-pill--new${size}`}>New host</span>
  }
  return null
}

/* Socials ----------------------------------------------------------------- */

// Official glyphs, unaltered, from Simple Icons (CC0). Brand rules: one solid
// colour, no outlines, no rotation.
const GLYPHS = {
  instagram:
    'M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077',
  tiktok:
    'M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z',
}

export function SocialGlyph({ kind, size = 16 }) {
  return (
    <svg
      className="social-glyph"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d={GLYPHS[kind]} />
    </svg>
  )
}

export function SocialLinks({ instagram, tiktok }) {
  const items = [
    ['instagram', instagram],
    ['tiktok', tiktok],
  ].filter(([, handle]) => handle)
  if (items.length === 0) return null
  return items.map(([kind, handle]) => (
    <a
      key={kind}
      className="profile-social"
      href={socialUrl(kind, handle)}
      target="_blank"
      rel="noopener noreferrer nofollow"
      aria-label={`${SOCIALS[kind].label}: ${handle}`}
    >
      <SocialGlyph kind={kind} />
      {handle}
    </a>
  ))
}

/* Stats ------------------------------------------------------------------- */

export function StatCard({ tone = 'navy', value, label, icon, locked = false, placeholder = false }) {
  return (
    <div
      className={[
        'stat-card',
        `stat-card--${tone}`,
        locked ? 'stat-card--private' : '',
        placeholder ? 'stat-card--placeholder' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span className="stat-card__stripe" aria-hidden="true" />
      <div className="stat-card__body">
        {icon ? (
          <span className="stat-card__icon">
            <Icon name={icon} size={18} strokeWidth={2} />
          </span>
        ) : null}
        <span className="stat-card__value">{value}</span>
        <span className="stat-card__label">
          {locked ? <Icon name="lock" size={12} strokeWidth={2.2} /> : null}
          {label}
        </span>
      </div>
    </div>
  )
}

/* Medals ------------------------------------------------------------------ */

const ROSETTE =
  '28.0,2.0 31.4,4.7 35.4,3.2 37.8,6.8 42.1,6.6 43.3,10.7 47.4,11.9 47.2,16.2 50.8,18.6 49.3,22.6 52.0,26.0 49.3,29.4 50.8,33.4 47.2,35.8 47.4,40.1 43.3,41.3 42.1,45.4 37.8,45.2 35.4,48.8 31.4,47.3 28.0,50.0 24.6,47.3 20.6,48.8 18.2,45.2 13.9,45.4 12.7,41.3 8.6,40.1 8.8,35.8 5.2,33.4 6.7,29.4 4.0,26.0 6.7,22.6 5.2,18.6 8.8,16.2 8.6,11.9 12.7,10.7 13.9,6.6 18.2,6.8 20.6,3.2 24.6,4.7'

const MEDAL_SCHEMES = {
  coral: { ribbon: '#D97756', ribbonDark: '#B8613F', ring: '#D97756', ring2: '#EC8873', inner: '#FDF1EC', text: '#A24E2E' },
  blue: { ribbon: '#6E80B0', ribbonDark: '#4F608E', ring: '#6E80B0', ring2: '#8E9DC4', inner: '#EEF1F8', text: '#3D4C6E' },
  green: { ribbon: '#2F7A55', ribbonDark: '#225C40', ring: '#2F7A55', ring2: '#4F9A73', inner: '#EEF6F1', text: '#23603F' },
  locked: { ribbon: '#D3CCBE', ribbonDark: '#C2BAAA', ring: '#C9C1B2', ring2: '#D9D2C4', inner: '#F4F1EA', text: '#7A8296' },
}

export function Medal({ medal }) {
  const scheme = MEDAL_SCHEMES[medal.earned ? medal.scheme : 'locked']
  return (
    <li className={medal.earned ? 'medal' : 'medal medal--locked'}>
      <span className="medal__art">
        <svg width="56" height="70" viewBox="0 0 56 70" aria-hidden="true" focusable="false">
          <polygon points="17,38 27,42 22,68 17,62.5 12,66" fill={scheme.ribbon} />
          <polygon points="39,38 29,42 34,68 39,62.5 44,66" fill={scheme.ribbonDark} />
          <polygon points={ROSETTE} fill={scheme.ring} />
          <circle cx="28" cy="26" r="18" fill={scheme.ring2} />
          <circle
            cx="28"
            cy="26"
            r="15.5"
            fill={scheme.inner}
            stroke="#FFFFFF"
            strokeOpacity="0.7"
            strokeWidth="1"
            strokeDasharray={medal.earned ? undefined : '2.5 2.5'}
          />
          <path
            d="M17.5 21a11.5 11.5 0 0 1 8-7.5"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeOpacity="0.85"
          />
        </svg>
        <span className="medal__mark" style={{ color: scheme.text }} aria-hidden="true">
          {medal.mark === 'star' ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8-6.2-3.2L5.8 21 7 14.2 2 9.3l6.9-1z" />
            </svg>
          ) : (
            medal.mark
          )}
        </span>
      </span>
      <span className="medal__label">
        {medal.label}
        <span className="visually-hidden">{medal.earned ? ' (earned)' : ' (not yet earned)'}</span>
      </span>
    </li>
  )
}

export function MedalRow({ medals, hint, onShare, shareNote }) {
  return (
    <section className="profile-medals" aria-labelledby="profile-medals-title">
      <div className="profile-card-head">
        <h2 id="profile-medals-title" className="eyebrow profile-card-head__title">
          Milestones
        </h2>
        {onShare ? (
          <button type="button" className="profile-text-button" onClick={onShare}>
            Share
          </button>
        ) : null}
      </div>
      <ul className="profile-medals__row">
        {medals.map((medal) => (
          <Medal key={medal.id} medal={medal} />
        ))}
      </ul>
      {hint ? <p className="profile-medals__hint">{hint}</p> : null}
      {shareNote ? (
        <p className="profile-medals__hint" role="status">
          {shareNote}
        </p>
      ) : null}
    </section>
  )
}
