import Icon from './ui/Icon'

const TIPS = [
  'Natural light is your best friend. A window beats any flash.',
  'Lead with the good stuff: the latte, the bowl, the finished piece.',
  'Hands in action beat an empty room.',
  'Tidy the background so your skill takes centre stage.',
]

/** Photo guidance shown beside the upload on create and edit listing (DESIGN.md section 7). */
export default function PhotoTips() {
  return (
    <aside className="photo-tips" aria-label="Photo tips">
      <p className="photo-tips__title">
        <Icon name="sparkle" size={18} />
        A few tips for great photos
      </p>
      <ul className="photo-tips__list">
        {TIPS.map((tip) => (
          <li key={tip}>{tip}</li>
        ))}
      </ul>
    </aside>
  )
}
