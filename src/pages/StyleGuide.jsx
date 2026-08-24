import Button from '../components/ui/Button'
import Input from '../components/ui/Input'

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

      <section className="style-guide-section" aria-labelledby="input-preview-heading">
        <h2 id="input-preview-heading">Inputs</h2>
        <div className="style-guide-grid">
          <article className="style-guide-card">
            <p className="style-guide-card__label">Text</p>
            <p className="style-guide-card__usage">Used for names, titles, and other short text</p>
            <Input
              id="style-guide-full-name"
              label="Full name"
              type="text"
              placeholder="Your name"
              autoComplete="name"
            />
          </article>
          <article className="style-guide-card">
            <p className="style-guide-card__label">Password</p>
            <p className="style-guide-card__usage">Used for login and signup</p>
            <Input
              id="style-guide-password"
              label="Password"
              type="password"
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </article>
          <article className="style-guide-card">
            <p className="style-guide-card__label">Error</p>
            <p className="style-guide-card__usage">Shown under the field, same red as login errors</p>
            <Input
              id="style-guide-email-error"
              label="Email"
              type="text"
              defaultValue="you@example.com"
              error="Email rate limit exceeded"
              autoComplete="email"
            />
          </article>
        </div>
      </section>
    </div>
  )
}
