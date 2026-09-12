import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
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

  it('renders browse mode as a link with a badge and one price and rating line', () => {
    const { container } = render(
      <MemoryRouter>
        <Card
          mode="browse"
          to="/listings/latte"
          badge="Food"
          title="Learn latte art with me"
          rating={4.8}
          price="$20/person"
        />
      </MemoryRouter>
    )

    const link = screen.getByRole('link', { name: /Learn latte art with me/ })
    expect(link).toHaveAttribute('href', '/listings/latte')
    expect(link.className).toContain('ui-card--browse')
    expect(screen.getByText('Food')).toBeInTheDocument()
    expect(container.querySelectorAll('.ui-card__meta-line')).toHaveLength(1)
    expect(container.querySelector('.ui-card__meta-line').textContent).toBe(
      '$20/person · ★ 4.8'
    )
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('drops the dot and the star in browse mode when there is no rating', () => {
    const { container } = render(
      <MemoryRouter>
        <Card mode="browse" to="/listings/boxing" title="Boxing basics" price="$32/person" />
      </MemoryRouter>
    )

    expect(container.querySelector('.ui-card__meta-line').textContent).toBe('$32/person')
    expect(container.querySelector('.ui-card__rating')).not.toBeInTheDocument()
  })
})
