import Button from '../components/ui/Button'

const BUTTON_PREVIEWS = [
  {
    label: 'Primary',
    usage: 'Book, Confirm cancellation, Sign up',
    variant: 'primary',
    text: 'Book',
  },
  {
    label: 'Secondary',
    usage: 'Keep booking',
    variant: 'secondary',
    text: 'Keep booking',
  },
  {
    label: 'Destructive',
    usage: 'Cancel booking',
    variant: 'destructive',
    text: 'Cancel booking',
  },
]

export default function StyleGuide() {
  return (
    <div className="page">
      <h1>Component preview</h1>
      <section className="style-guide-section" aria-labelledby="button-preview-heading">
        <h2 id="button-preview-heading">Buttons</h2>
        <div className="style-guide-grid">
          {BUTTON_PREVIEWS.map((preview) => (
            <article key={preview.variant} className="style-guide-card">
              <p className="style-guide-card__label">{preview.label}</p>
              <p className="style-guide-card__usage">Used for {preview.usage}</p>
              <Button variant={preview.variant}>{preview.text}</Button>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
