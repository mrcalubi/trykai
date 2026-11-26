import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import Card from './Card'
import Button from './Button'

describe('Card', () => {
  it('renders booking mode with title, meta lines, and footer', () => {
    render(
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
    )

    expect(screen.getByRole('heading', { name: 'Learn latte art with me', level: 3 })).toBeInTheDocument()
    expect(screen.getByText('Mei Ling · Tampines')).toBeInTheDocument()
    expect(screen.getByText('Sat, 30 Aug at 2:00 pm')).toBeInTheDocument()
    expect(screen.getByText('$20/person')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Book' })).toBeInTheDocument()
  })

  it('turns the image into a View photos control when asked', async () => {
    const user = userEvent.setup()
    const onImageClick = vi.fn()
    render(
      <Card
        mode="browse"
        title="Pottery hour"
        image="https://cdn.test/pottery.jpg"
        onImageClick={onImageClick}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'View photos' }))
    expect(onImageClick).toHaveBeenCalledTimes(1)
  })

  it('renders the image when a source is provided', () => {
    render(<Card title="Pottery hour" image="https://cdn.test/pottery.jpg" imageAlt="Pottery hour" />)

    expect(screen.getByRole('img', { name: 'Pottery hour' })).toHaveAttribute(
      'src',
      'https://cdn.test/pottery.jpg'
    )
  })

  it('falls back to a placeholder when there is no image', () => {
    const { container } = render(<Card mode="browse" title="Boxing basics" />)

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(container.querySelector('.ui-card__placeholder')).toBeInTheDocument()
  })

  it('omits the image area in booking mode when there is no image', () => {
    const { container } = render(
      <Card mode="booking" title="Learn latte art with me" meta="Sat, 30 Aug at 2:00 pm" />
    )

    expect(container.querySelector('.ui-card__image-wrap')).not.toBeInTheDocument()
  })

  it('overlays an optional category badge on the image', () => {
    render(<Card title="Latte art" badge="Food" />)

    expect(screen.getByText('Food')).toBeInTheDocument()
  })

  it('shows the category as an icon on a browse photo, still named for screen readers', () => {
    const { container } = render(
      <MemoryRouter>
        <Card mode="browse" to="/listings/l" title="Latte art" badge="Food" image="https://x/p.jpg" />
      </MemoryRouter>
    )
    const badge = container.querySelector('.ui-card__badge--icon')
    expect(badge).toHaveAttribute('title', 'Food')
    expect(badge.querySelector('svg')).toBeInTheDocument()
    expect(within(badge).getByText('Food')).toHaveClass('visually-hidden')
  })

  it('leaves the icon to the placeholder when a browse card has no photo', () => {
    const { container } = render(
      <MemoryRouter>
        <Card mode="browse" to="/listings/l" title="Latte art" badge="Food" />
      </MemoryRouter>
    )
    expect(container.querySelector('.ui-card__badge')).toBeNull()
    expect(screen.getByText('Food')).toHaveClass('visually-hidden')
  })

  it('shows a rating only when a real rating value is passed', () => {
    const { rerender, container } = render(
      <Card title="Latte art" meta="Mei Ling · Tampines" rating={4.8} />
    )

    expect(screen.getByText(/4\.8/)).toBeInTheDocument()
    expect(container.querySelector('.ui-card__rating')).toBeInTheDocument()

    rerender(<Card title="Latte art" meta="Mei Ling · Tampines" />)
    expect(container.querySelector('.ui-card__rating')).not.toBeInTheDocument()
    expect(screen.queryByText('0')).not.toBeInTheDocument()
    expect(screen.queryByText('—')).not.toBeInTheDocument()
  })

  it('renders the title at whatever level the page needs', () => {
    render(<Card title="Latte art" titleLevel={2} />)

    expect(screen.getByRole('heading', { name: 'Latte art', level: 2 })).toBeInTheDocument()
  })

  it('shows the rating to one decimal even when it is a whole number', () => {
    render(<Card title="Latte art" rating={5} />)

    expect(screen.getByText(/5\.0/)).toBeInTheDocument()
  })

  it('renders browse mode as a link: length on the photo, then title, area and date, price and rating', () => {
    const { container } = render(
      <MemoryRouter>
        <Card
          mode="browse"
          to="/listings/latte"
          badge="Food"
          title="Learn latte art with me"
          metaItems={['Changi', 'Sat, 5 Dec']}
          rating={4.8}
          price="S$20"
          priceUnit="/person"
          length="1.5 hr"
        />
      </MemoryRouter>
    )

    const link = screen.getByRole('link', { name: /Learn latte art with me/ })
    expect(link).toHaveAttribute('href', '/listings/latte')
    expect(link.className).toContain('ui-card--browse')
    expect(screen.getByText('Food')).toBeInTheDocument()

    // The length sits on the photo, where a video shows its running time.
    const length = container.querySelector('.ui-card__image-wrap > .ui-card__length')
    expect(length.textContent).toBe('1.5 hr')
    expect(length.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')

    expect(container.querySelector('.ui-card__meta-inline').textContent).toBe('ChangiSat, 5 Dec')

    const row = container.querySelector('.ui-card__price-row')
    expect(row.textContent).toBe('S$20/person★ 4.8')
    expect(row.querySelector('.ui-card__amount').textContent).toBe('S$20')
    expect(row.querySelector('.ui-card__unit').textContent).toBe('/person')
    expect(row.querySelector('.ui-card__rating').textContent).toBe('★ 4.8')
    expect(row.querySelector('.ui-card__length')).toBeNull()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('appends the review count beside the price when reviews exist', () => {
    const { container } = render(
      <MemoryRouter>
        <Card
          mode="browse"
          to="/listings/latte"
          title="Learn latte art with me"
          metaItems={['Changi']}
          rating={4.8}
          reviewCount={12}
          price="S$28"
        />
      </MemoryRouter>
    )

    expect(container.querySelector('.ui-card__price-row').textContent).toBe('S$28★ 4.8 (12)')
    expect(container.querySelector('.ui-card__star')).toBeInTheDocument()
    expect(container.querySelector('.ui-card__review-count').textContent).toBe(' (12)')
  })

  it('drops the star in browse mode when there is no rating', () => {
    const { container } = render(
      <MemoryRouter>
        <Card
          mode="browse"
          to="/listings/boxing"
          title="Boxing basics"
          metaItems={['Bukit Merah']}
          price="S$32"
          priceUnit="/person"
          length="1 hr"
        />
      </MemoryRouter>
    )

    expect(container.querySelector('.ui-card__meta-inline').textContent).toBe('Bukit Merah')
    expect(container.querySelector('.ui-card__rating')).not.toBeInTheDocument()
    expect(container.querySelector('.ui-card__price-row').textContent).toBe('S$32/person')
  })

  it('shows a flag where the rating would be', () => {
    const { container } = render(
      <MemoryRouter>
        <Card mode="browse" to="/listings/new" title="Pottery" metaItems={['Bedok']} price="S$20" flag="New" />
      </MemoryRouter>
    )

    expect(container.querySelector('.ui-card__price-row .ui-card__flag').textContent).toBe('New')
  })

  it('shows the length on the placeholder too, and leaves it out when unknown', () => {
    const { container, rerender } = render(
      <MemoryRouter>
        <Card mode="browse" to="/listings/x" title="Pottery" price="S$20" length="2 hr" />
      </MemoryRouter>
    )
    expect(container.querySelector('.ui-card__placeholder')).toBeInTheDocument()
    expect(container.querySelector('.ui-card__image-wrap > .ui-card__length').textContent).toBe('2 hr')

    rerender(
      <MemoryRouter>
        <Card mode="browse" to="/listings/x" title="Pottery" price="S$20" priceUnit="/person" />
      </MemoryRouter>
    )
    expect(container.querySelector('.ui-card__length')).not.toBeInTheDocument()
  })

  it('keeps the length off booking cards', () => {
    const { container } = render(<Card mode="booking" title="Pottery" length="2 hr" />)
    expect(container.querySelector('.ui-card__length')).not.toBeInTheDocument()
  })

  it('pins the length to the bottom-right of the photo, and lets clicks reach the photo', () => {
    const css = readFileSync(resolve(import.meta.dirname, '../../index.css'), 'utf8')
    const rule = (selector) => {
      const start = css.indexOf(`\n${selector} {`)
      return start < 0 ? '' : css.slice(start, css.indexOf('}', start))
    }
    const length = rule('.ui-card__length')
    expect(length).toMatch(/position:\s*absolute/)
    expect(length).toMatch(/right:\s*10px/)
    expect(length).toMatch(/bottom:\s*\d+px/)
    expect(length).toMatch(/pointer-events:\s*none/)
    // Same colours as the category tag on the top-left corner.
    const badge = rule('.ui-card__badge')
    for (const prop of ['color', 'background', 'box-shadow']) {
      const value = (r) => r.match(new RegExp(`[\\s;{]${prop}:\\s*([^;]+);`))?.[1]
      expect(value(length)).toBeTruthy()
      expect(value(length)).toBe(value(badge))
    }
    expect(rule('.ui-card__price-row')).toMatch(/justify-content:\s*space-between/)
    expect(rule('.ui-card__price-row')).toMatch(/flex-wrap:\s*wrap/)
  })

  it('does not reserve a second line under a one-line browse title', () => {
    const css = readFileSync(resolve(import.meta.dirname, '../../index.css'), 'utf8')
    const browseTitle = css.match(/\.ui-card--browse \.ui-card__title \{[\s\S]*?\n\}/)
    expect(browseTitle?.[0]).toBeTruthy()
    expect(browseTitle[0]).not.toMatch(/min-height/)
  })

  it('colours booking-mode stars with --star and browse stars as text', () => {
    const css = readFileSync(resolve(import.meta.dirname, '../../index.css'), 'utf8')
    expect(css).toMatch(/\.ui-card__star \{[\s\S]*?color:\s*var\(--star\)/)
    const browseStar = css.match(/\.ui-card--browse \.ui-card__star \{[\s\S]*?\n\}/)
    expect(browseStar?.[0]).toMatch(/color:\s*inherit/)
    const browseRating = css.match(/\.ui-card--browse \.ui-card__rating \{[\s\S]*?\n\}/)
    expect(browseRating?.[0]).toMatch(/font-family:\s*var\(--sans\)/)
    expect(css).toMatch(/\.ui-card--browse \.ui-card__review-count \{[\s\S]*?color:\s*var\(--muted\)/)
    const row = css.match(/\.ui-card__price-row \{[\s\S]*?\n\}/)
    expect(row?.[0]).toMatch(/justify-content:\s*space-between/)
  })

  it('shows the first letter of the host display name', () => {
    const { container } = render(
      <MemoryRouter>
        <Card
          mode="browse"
          to="/listings/latte"
          title="Learn latte art with me"
          host={{ name: 'Latte Queen' }}
        />
      </MemoryRouter>
    )

    expect(container.querySelector('.ui-card__host')).toHaveTextContent('L')
    expect(container.querySelector('.ui-card__host')).not.toHaveTextContent('LQ')
    const face = container.querySelector('.ui-card__host .ui-avatar')
    expect(face).toHaveStyle({ width: '100%', height: '100%' })
    expect(face.getAttribute('style') ?? '').not.toMatch(/36px/)
  })

  it('lets the title column shrink inside the grid instead of overflowing', () => {
    const css = readFileSync(resolve(import.meta.dirname, '../../index.css'), 'utf8')
    const body = css.match(/\.ui-card__body \{[\s\S]*?\n\}/)
    expect(body?.[0]).toMatch(/flex:\s*1/)
    expect(body?.[0]).toMatch(/min-width:\s*0/)
  })
})
