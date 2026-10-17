/**
 * Line icons drawn on a 24px grid with a 1.8 stroke, coloured by currentColor.
 * Decorative by default; pass `label` when the icon is the only content.
 */
const PATHS = {
  shield: (
    <>
      <path d="M12 3l7 3v6c0 4.2-3 7.6-7 9-4-1.4-7-4.8-7-9V6l7-3z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s-6-5.3-6-11a6 6 0 0112 0c0 5.7-6 11-6 11z" />
      <circle cx="12" cy="10" r="2.2" />
    </>
  ),
  wallet: (
    <>
      <rect x="3" y="6" width="18" height="13" rx="2.5" />
      <path d="M3 10h18M16 14.5h2" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19c.6-3 2.8-4.6 5.5-4.6s4.9 1.6 5.5 4.6M16 5a3 3 0 010 6M17.5 14.6c1.7.6 2.8 2 3 4.4" />
    </>
  ),
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  star: <path d="M12 3.8l2.5 5.2 5.7.7-4.2 3.9 1.1 5.6L12 16.4l-5.1 2.8 1.1-5.6-4.2-3.9 5.7-.7L12 3.8z" />,
  arrowRight: <path d="M5 12h14M13 6l6 6-6 6" />,
  arrowDown: <path d="M12 5v14M6 13l6 6 6-6" />,
  chevronDown: <path d="M6 9l6 6 6-6" />,
  sparkle: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4.2-4.2" />
    </>
  ),
  // Categories
  grid: (
    <>
      <rect x="4" y="4" width="7" height="7" rx="2" />
      <rect x="13" y="4" width="7" height="7" rx="2" />
      <rect x="4" y="13" width="7" height="7" rx="2" />
      <rect x="13" y="13" width="7" height="7" rx="3.5" />
    </>
  ),
  food: (
    <>
      <path d="M4 9h13v5a5 5 0 01-5 5H9a5 5 0 01-5-5V9z" />
      <path d="M17 11h1.5a2.5 2.5 0 010 5H17" />
      <path d="M8 3.5c0 1.2 1 1.3 1 2.5M12 3.5c0 1.2 1 1.3 1 2.5" />
    </>
  ),
  fitness: <path d="M6.5 7v10M17.5 7v10M3.5 9.5v5M20.5 9.5v5M6.5 12h11" />,
  arts: (
    <>
      <path d="M12 3.5a8.5 8.5 0 100 17c1.2 0 1.8-.8 1.8-1.7 0-1.2-1-1.5-1-2.6 0-1 .8-1.7 1.8-1.7h2.2c2 0 3.7-1.6 3.7-3.7C20.5 6.6 16.7 3.5 12 3.5z" />
      <circle cx="7.5" cy="11" r="1.1" />
      <circle cx="10" cy="7.2" r="1.1" />
      <circle cx="14.6" cy="7.4" r="1.1" />
    </>
  ),
  music: (
    <>
      <path d="M9 18V5.5l11-2V16" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="17.5" cy="16" r="2.5" />
    </>
  ),
  language: (
    <>
      <path d="M4 5h12a2 2 0 012 2v6a2 2 0 01-2 2h-6l-4 3.5V15H4a2 2 0 01-2-2V7a2 2 0 012-2z" />
      <path d="M7 10h6" />
      <path d="M20 9.5a2 2 0 011.5 1.9v5.1a2 2 0 01-2 2h-.5V21l-3.2-2.5" />
    </>
  ),
  other: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8 12h.01M12 12h.01M16 12h.01" strokeWidth="2.6" />
    </>
  ),
}

export default function Icon({ name, size = 20, label, className = '', strokeWidth = 1.8 }) {
  const paths = PATHS[name]
  if (!paths) return null
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': 'true' }
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={['ui-icon', className].filter(Boolean).join(' ')}
      focusable="false"
      {...a11y}
    >
      {paths}
    </svg>
  )
}
