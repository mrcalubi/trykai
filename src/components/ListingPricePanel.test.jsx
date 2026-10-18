import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import ListingPricePanel from './ListingPricePanel'
import { hostPriceBreakdown } from '../lib/pricing'

describe('ListingPricePanel', () => {
  it('shows the two figures, the full-session line, and the non-founding footnote', async () => {
    const user = userEvent.setup()
    render(
      <ListingPricePanel breakdown={hostPriceBreakdown(2500, false, 4, true)} groupSize={4} />,
    )

    expect(screen.getByText('Guests pay').closest('.price-panel__figure')).toHaveTextContent('$28')
    expect(screen.getByText('You get').closest('.price-panel__figure')).toHaveTextContent('$25')
    expect(screen.getByText(/Full session of 4/)).toHaveTextContent('Full session of 4: $100')
    expect(screen.getByText(/Full session of 4/)).not.toHaveTextContent('up to')
    expect(screen.getByText('10% host fee from your 4th booking.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'How these numbers work' }))
    expect(screen.getByText('5+ guests: 20% off the lesson')).toBeInTheDocument()
    expect(screen.getByText(/One group of 4: \$85 before any host fee/)).toBeInTheDocument()
  })

  it('uses the founding footnote and hides the after-fee popover line', async () => {
    const user = userEvent.setup()
    render(<ListingPricePanel breakdown={hostPriceBreakdown(2500, true, 4, true)} groupSize={4} />)

    expect(screen.getByText('Founding host: no host fee, ever.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'How these numbers work' }))
    expect(screen.queryByText(/After the 10% host fee/)).not.toBeInTheDocument()
  })
})
