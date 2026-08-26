import { useState } from 'react'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Card from '../components/ui/Card'
import SelectableCard from '../components/ui/SelectableCard'
import TopNav, { TopNavAccount } from '../components/ui/TopNav'
import foodIcon from '../assets/categories/food.png'
import fitnessIcon from '../assets/categories/fitness.png'
import artsIcon from '../assets/categories/arts.png'
// import musicIcon from '../assets/categories/music.png'
// import languageIcon from '../assets/categories/language.png'
// import otherIcon from '../assets/categories/other.png'

const ACCOUNT_PREVIEWS = [
  {
    label: 'Photo',
    usage: 'avatarUrl present — image cropped to a circle',
    avatarUrl: '/trykai.png',
    name: 'Mei Ling',
  },
  {
    label: 'Initials',
    usage: 'No photo — first letters of first and last name',
    name: 'Mei Ling',
  },
]

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

const SCROLL_FILLERS = [
  'Scroll down to see the TopNav shrink — the TryKai wordmark hides and the bar gets shorter.',
  'Keep scrolling. The logo mark stays centered while the left menu and right account stay pinned to the edges.',
  'Scroll back to the top and the wordmark returns with the full-height bar.',
  'This block is only here so the style-guide page is tall enough to exercise that scroll behavior.',
  'More filler space for phone-width testing of the compact TopNav.',
  'Still more room — stop when you have checked both the expanded and compact states.',
]

export default function StyleGuide() {
  // Matches Home category pills: single select, one active category at a time.
  const [selectedCategory, setSelectedCategory] = useState('Food')
  const [previewLoggedIn, setPreviewLoggedIn] = useState(false)

  return (
    <div className="style-guide-page">
      <TopNav
        isLoggedIn={previewLoggedIn}
        avatarUrl="/trykai.png"
        name="Mei Ling"
        onMenuClick={() => {}}
      />

      <div className="page">
        <h1>Component preview</h1>

        <section className="style-guide-section" aria-labelledby="topnav-preview-heading">
          <h2 id="topnav-preview-heading">Top nav</h2>
          <p className="style-guide-section__note">
            Fixed bar above. Open the hamburger (slides in from the left), and scroll to see the bar shrink.
          </p>
          <label className="style-guide-toggle">
            <input
              type="checkbox"
              checked={previewLoggedIn}
              onChange={(event) => setPreviewLoggedIn(event.target.checked)}
            />
            Simulate logged in
          </label>
          <p className="style-guide-section__note style-guide-section__note--spaced">
            Logged-in account control — photo or initials.
          </p>
          <div className="style-guide-avatar-row">
            {ACCOUNT_PREVIEWS.map((preview) => (
              <article key={preview.label} className="style-guide-avatar-demo">
                <p className="style-guide-card__label">{preview.label}</p>
                <p className="style-guide-card__usage">{preview.usage}</p>
                <TopNavAccount
                  avatarUrl={preview.avatarUrl}
                  name={preview.name}
                />
              </article>
            ))}
          </div>
        </section>

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
          Borderless grid tiles. Browse is the whole-card link; booking keeps date and actions.
        </p>
        <div className="style-guide-card-grid">
          <article className="style-guide-card-example">
            <p className="style-guide-card__label">Browse card</p>
            <p className="style-guide-card__usage">
              Category badge, host · area, optional rating, price only. Whole card clickable.
            </p>
            <Card
              mode="browse"
              to="/listings/example"
              badge="Food"
              title="Learn latte art with me"
              meta="Mei Ling · Tampines"
              rating={4.8}
              price="$20/person"
            />
          </article>
          <article className="style-guide-card-example">
            <p className="style-guide-card__label">Booking card</p>
            <p className="style-guide-card__usage">
              Date, price, and action buttons for the dashboard booking row.
            </p>
            <Card
              mode="booking"
              title="Learn latte art with me"
              meta={['Mei Ling · Tampines', 'Sat, 30 Aug at 2:00 pm']}
              footer={
                <>
                  <span className="ui-card__price">$20/person</span>
                  <Button variant="primary">Book</Button>
                </>
              }
            />
          </article>
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

        <section className="style-guide-section" aria-labelledby="topnav-scroll-heading">
          <h2 id="topnav-scroll-heading">Scroll space</h2>
          <p className="style-guide-section__note">
            Placeholder content so you can scroll and check the TopNav compact state.
          </p>
          <div className="style-guide-scroll-fill">
            {SCROLL_FILLERS.map((line) => (
              <p key={line} className="style-guide-scroll-fill__block">
                {line}
              </p>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
