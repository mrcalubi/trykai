import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '../test/render'
import {
  ArrivalInstructionsField,
  BookingCutoffFields,
  CheckoutHostNote,
  HostContactLinks,
} from './BookingCutoffFields'
import { ARRIVAL_INSTRUCTIONS_PLACEHOLDER } from '../lib/bookingCutoff'

describe('BookingCutoffFields', () => {
  it('lets the host pick how long before a session bookings close', async () => {
    const onChange = vi.fn()
    const { user } = renderWithRouter(<BookingCutoffFields value={3} onChange={onChange} />)
    expect(screen.getByLabelText('3 hours')).toBeChecked()
    expect(
      screen.getByText('Pick longer if you need time to buy materials or prepare add-ons.'),
    ).toBeInTheDocument()
    await user.click(screen.getByLabelText('48 hours'))
    expect(onChange).toHaveBeenCalledWith(48)
  })

  it('counts How to find me characters and keeps the placeholder', async () => {
    const onChange = vi.fn()
    const { user } = renderWithRouter(
      <ArrivalInstructionsField value="Lift B" onChange={onChange} />,
    )
    expect(screen.getByPlaceholderText(ARRIVAL_INSTRUCTIONS_PLACEHOLDER)).toBeInTheDocument()
    expect(screen.getByText(/Optional\. 6\/200/)).toBeInTheDocument()
    await user.type(screen.getByLabelText(/How to find me/), 'x')
    expect(onChange).toHaveBeenCalled()
  })

  it('always shows a note field for the host', () => {
    renderWithRouter(<CheckoutHostNote hostName="Mei" value="" onChange={() => {}} />)
    expect(screen.getByLabelText(/Note for Mei \(optional\)/)).toBeInTheDocument()
    expect(screen.getByText('For example, allergies or running a little late.')).toBeInTheDocument()
  })

  it('builds Call and WhatsApp links from a stored number', () => {
    renderWithRouter(<HostContactLinks phone="+6591234567" />)
    expect(screen.getByRole('link', { name: 'Call' })).toHaveAttribute('href', 'tel:+6591234567')
    expect(screen.getByRole('link', { name: 'WhatsApp' })).toHaveAttribute(
      'href',
      'https://wa.me/6591234567',
    )
  })
})
