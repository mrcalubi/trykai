import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MarketingToggle from './MarketingToggle'
import * as marketing from '../lib/marketing'

vi.mock('../lib/marketing', () => ({ marketingOptIn: vi.fn(), setMarketingOptIn: vi.fn() }))

describe('MarketingToggle', () => {
  beforeEach(() => vi.clearAllMocks())

  it('hides until the choice loads, or when it cannot', async () => {
    marketing.marketingOptIn.mockResolvedValue(null)
    const { container } = render(<MarketingToggle />)
    await vi.waitFor(() => expect(marketing.marketingOptIn).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the choice and saves changes straight away', async () => {
    marketing.marketingOptIn.mockResolvedValue(true)
    marketing.setMarketingOptIn.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    render(<MarketingToggle />)
    const box = await screen.findByRole('checkbox', { name: /new sessions and offers/ })
    expect(box).toBeChecked()
    await userEvent.click(box)
    expect(marketing.setMarketingOptIn).toHaveBeenCalledWith(false)
    expect(await screen.findByText("Saved. You won't get offers by email.")).toBeInTheDocument()
    expect(box).not.toBeChecked()
    await userEvent.click(box)
    expect(await screen.findByText('Saved. We email at most once a week.')).toBeInTheDocument()
  })

  it('says so when saving fails', async () => {
    marketing.marketingOptIn.mockResolvedValue(false)
    marketing.setMarketingOptIn.mockResolvedValue(null)
    render(<MarketingToggle />)
    await userEvent.click(await screen.findByRole('checkbox', { name: /new sessions and offers/ }))
    expect(await screen.findByText('Could not save. Try again.')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /new sessions and offers/ })).not.toBeChecked()
  })
})
