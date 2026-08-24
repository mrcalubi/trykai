import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Card from './Card'

describe('Card', () => {
  it('renders a title, meta lines, and footer', () => {
    render(
      <Card
        title="Learn latte art with me"
        meta={['Mei Ling · Tampines', 'Sat, 30 Aug at 2:00 pm']}
        footer={<span>$20/person</span>}
      />
    )

    expect(screen.getByRole('heading', { name: 'Learn latte art with me', level: 3 })).toBeInTheDocument()
    expect(screen.getByText('Mei Ling · Tampines')).toBeInTheDocument()
    expect(screen.getByText('Sat, 30 Aug at 2:00 pm')).toBeInTheDocument()
    expect(screen.getByText('$20/person')).toBeInTheDocument()
  })

  it('renders the image when a source is provided', () => {
    render(<Card title="Pottery hour" image="https://cdn.test/pottery.jpg" imageAlt="Pottery hour" />)

    expect(screen.getByRole('img', { name: 'Pottery hour' })).toHaveAttribute(
      'src',
      'https://cdn.test/pottery.jpg'
    )
  })

  it('falls back to a placeholder when there is no image', () => {
    const { container } = render(<Card title="Boxing basics" />)

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(container.querySelector('.ui-card__placeholder')).toBeInTheDocument()
  })
})
