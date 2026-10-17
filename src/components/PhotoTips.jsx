import Icon from './ui/Icon'

const TIPS = [
  'Shoot by a window in daylight, with the flash off.',
  'Lead with the finished thing guests will make or do.',
  'Show hands mid-activity, not an empty room.',
  'Clear the background so the session is the subject.',
]

/** Photo guidance shown beside the upload on create and edit listing (DESIGN.md section 7). */
export default function PhotoTips() {
  return (
    <aside className="photo-tips" aria-label="Photo tips">
      <p className="photo-tips__title">
        <Icon name="sparkle" size={18} />
        Good photos win bookings
      </p>
      <ul className="photo-tips__list">
        {TIPS.map((tip) => (
          <li key={tip}>{tip}</li>
        ))}
      </ul>
    </aside>
  )
}
