import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import ListingCard from './ListingCard'
import { renderWithRouter } from '../test/render'
import { makeListing } from '../test/fixtures'

function renderCard(overrides) {
  return renderWithRouter(<ListingCard listing={makeListing(overrides)} />)
}

describe('ListingCard', () => {
  it('links through to the listing detail page', () => {
    renderCard({ id: 'listing-42', title: 'Boxing basics' })
    expect(screen.getByRole('link', { name: /Boxing basics/ })).toHaveAttribute(
      'href',
      '/listings/listing-42'
    )
  })

  it('shows the card all-in total, not the raw lesson price', () => {
    renderCard({ price_per_person: 4500 })
    expect(screen.getByText(/\$51\/person/)).toBeInTheDocument()
  })

  it('rounds the advertised total up to a whole dollar', () => {
    renderCard({ price_per_person: 2500 })
    expect(screen.getByText(/\$28\/person/)).toBeInTheDocument()
  })

  it('builds the meta line from host, area and all-in price', () => {
    renderCard({ area: 'Tampines', price_per_person: 3000, host: { full_name: 'Mei Ling' } })
    expect(screen.getByText('Mei Ling · Tampines · $34/person')).toBeInTheDocument()
  })

  it('reads the host name from the `users` relation when `host` is absent', () => {
    renderCard({ host: undefined, users: { full_name: 'Arun' } })
    expect(screen.getByText(/^Arun · /)).toBeInTheDocument()
  })

  it('reads the host name when the relation comes back as an array', () => {
    renderCard({ host: [{ full_name: 'Siti' }] })
    expect(screen.getByText(/^Siti · /)).toBeInTheDocument()
  })

  it('omits the host segment when there is no host record', () => {
    renderCard({ host: undefined, users: undefined, area: 'Bedok', price_per_person: 2000 })
    expect(screen.getByText('Bedok · $23/person')).toBeInTheDocument()
  })

  it('renders the first photo with the listing title as alt text', () => {
    renderCard({ title: 'Pottery hour', photo_urls: ['https://cdn.test/a.jpg', 'https://cdn.test/b.jpg'] })
    const image = screen.getByRole('img', { name: 'Pottery hour' })
    expect(image).toHaveAttribute('src', 'https://cdn.test/a.jpg')
  })

  it('falls back to a placeholder when the listing has no photos', () => {
    const { container } = renderCard({ photo_urls: [] })
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(container.querySelector('.listing-card__placeholder')).toBeInTheDocument()
  })

  it('shows the category badge only when a category is set', () => {
    renderCard({ category: 'Fitness' })
    expect(screen.getByText('Fitness')).toBeInTheDocument()
  })

  it('hides the category badge when the listing has none', () => {
    const { container } = renderCard({ category: null })
    expect(container.querySelector('.listing-card__category')).not.toBeInTheDocument()
  })
})
