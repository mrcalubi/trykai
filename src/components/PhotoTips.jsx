import Icon from './ui/Icon'
import { PHOTO_TIPS } from '../lib/photoTips'

/** Photo guidance shown beside the upload on create and edit listing (DESIGN.md section 7). */
export default function PhotoTips() {
  return (
    <aside className="photo-tips" aria-label="Photo tips">
      <p className="photo-tips__title">
        <Icon name="sparkle" size={18} />
        Good photos win bookings
      </p>
      <ul className="photo-tips__list">
        {PHOTO_TIPS.map((tip) => (
          <li key={tip}>{tip}</li>
        ))}
      </ul>
    </aside>
  )
}
