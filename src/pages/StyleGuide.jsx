import { useState } from 'react'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Card from '../components/ui/Card'
import SelectableCard from '../components/ui/SelectableCard'
import foodIcon from '../assets/categories/food.png'
import fitnessIcon from '../assets/categories/fitness.png'
import artsIcon from '../assets/categories/arts.png'
// import musicIcon from '../assets/categories/music.png'
// import languageIcon from '../assets/categories/language.png'
// import otherIcon from '../assets/categories/other.png'

const CATEGORY_ICONS = {
  Food: foodIcon,
  Fitness: fitnessIcon,
  Arts: artsIcon,
  // Music: musicIcon,
  // Language: languageIcon,
  // Other: otherIcon,
}

const BROWSE_CATEGORIES = [
  { title: 'Food', description: 'Cook, bake, and taste something new' },
  { title: 'Fitness', description: 'Move, train, and try a workout' },
  { title: 'Arts', description: 'Make, paint, and create by hand' },
  { title: 'Music', description: 'Sing, play, or listen together' },
  { title: 'Language', description: 'Practice conversation and phrases' },
  { title: 'Other', description: 'Everything that does not fit above' },
]

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
  // Matches Home category pills: single select, one active category at a time.
  const [selectedCategory, setSelectedCategory] = useState('Food')

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
            <p className="style-guide-card__label">Default</p>
            <p className="style-guide-card__usage">Label stays above the field</p>
            <Input
              id="style-guide-full-name"
              label="Full name"
              type="text"
              placeholder="Your name"
              autoComplete="name"
            />
          </article>
          <article className="style-guide-card">
            <p className="style-guide-card__label">Floating label</p>
            <p className="style-guide-card__usage">Sits inside until focus or a value, then floats above</p>
            <Input
              id="style-guide-full-name-floating"
              label="Full name"
              type="text"
              floatingLabel
              autoComplete="name"
            />
          </article>
          <article className="style-guide-card">
            <p className="style-guide-card__label">Password</p>
            <p className="style-guide-card__usage">Used for login and signup. Eye toggles masked and plain text</p>
            <Input
              id="style-guide-password"
              label="Password"
              type="password"
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </article>
          <article className="style-guide-card">
            <p className="style-guide-card__label">Forgot password</p>
            <p className="style-guide-card__usage">
              Visual placeholder only — password reset is not built yet
            </p>
            <div className="style-guide-password-preview">
              <div className="style-guide-field__label-row">
                <label htmlFor="style-guide-password-forgot" className="ui-field__label">
                  Password
                </label>
                <span className="style-guide-forgot-link">Forgot password?</span>
              </div>
              <Input
                id="style-guide-password-forgot"
                type="password"
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>
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

      <section className="style-guide-section" aria-labelledby="card-preview-heading">
        <h2 id="card-preview-heading">Cards</h2>
        <p className="style-guide-section__note">
          Base for browse listing cards and dashboard booking cards. Full width on phone.
        </p>
        <div className="style-guide-card-grid">
          <Card
            title="Learn latte art with me"
            meta={['Mei Ling · Tampines', 'Sat, 30 Aug at 2:00 pm']}
            footer={
              <>
                <span className="ui-card__price">$20/person</span>
                <Button variant="primary">Book</Button>
              </>
            }
          />
        </div>
      </section>

      <section className="style-guide-section" aria-labelledby="selectable-card-preview-heading">
        <h2 id="selectable-card-preview-heading">Selectable cards</h2>
        <p className="style-guide-section__note">
          Browse category cards. Single select, same as Home filter pills. Preview only.
        </p>
        <div className="style-guide-selectable-grid">
          {BROWSE_CATEGORIES.map((category) => {
            const image = CATEGORY_ICONS[category.title]
            const pending = !image
            return (
              <SelectableCard
                key={category.title}
                title={category.title}
                description={category.description}
                image={image}
                imageAlt={category.title}
                placeholder={pending}
                selected={selectedCategory === category.title}
                onSelect={() => setSelectedCategory(category.title)}
              />
            )
          })}
        </div>
      </section>
    </div>
  )
}
