import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import HostNextUp from './HostNextUp'
import { renderWithRouter } from '../test/render'

const LISTING = { id: 'l1', title: 'Pottery', max_guests: 4, duration_mins: 90 }
const DAY = '2026-11-30T01:00:00Z' // Mon 30 Nov, 9:00 am in Singapore

function item(id, overrides = {}) {
  return {
    session: {
      id,
      listing_id: 'l1',
      starts_at: DAY,
      bookings: [{ id: `b-${id}`, status: 'confirmed', guests_count: 1 }],
      ...overrides.session,
    },
    guestRows: [],
    note: '',
    placeName: '',
    href: `/hosting?session=${id}`,
    ...overrides,
  }
}

function renderCard(props) {
  return renderWithRouter(<HostNextUp listing={LISTING} {...props} />, { route: '/hosting', path: '/hosting' })
}

describe('HostNextUp', () => {
  it('renders nothing without a session', () => {
    renderCard({ items: [] })
    expect(screen.queryByRole('heading', { name: 'Next up' })).not.toBeInTheDocument()
  })

  it('keeps one session as before, with no place line for a one-location listing', () => {
    renderCard({ items: [item('s1')] })
    expect(screen.getByText(/9:00 – 10:30 am ·/i)).toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View session' })).toHaveAttribute('href', '/hosting?session=s1')
  })

  it('gives each place its own time when the times differ', () => {
    renderCard({
      items: [
        item('s1', { placeName: 'Studio · Bishan' }),
        item('s2', {
          placeName: 'Annex · Bedok',
          session: { starts_at: '2026-11-30T01:30:00Z' },
          note: 'Gate code?',
        }),
      ],
    })
    const rows = screen.getAllByRole('listitem')
    expect(within(rows[0]).getByText(/9:00 – 10:30 am/i)).toBeInTheDocument()
    expect(within(rows[1]).getByText(/9:30 – 11:00 am/i)).toBeInTheDocument()
    expect(within(rows[1]).getByText('“Gate code?”')).toBeInTheDocument()
    // The shared line keeps only the day.
    expect(screen.queryByText(/9:00 – 10:30 am ·/i)).not.toBeInTheDocument()
  })

  it('still lists places it cannot name, with a plain link', () => {
    renderCard({ items: [item('s1'), item('s2')] })
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getAllByRole('link', { name: 'View session' })).toHaveLength(2)
  })
})
