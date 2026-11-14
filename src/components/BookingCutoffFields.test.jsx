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
  it('asks how much notice the host needs and spells out what it means', async () => {
    const onChange = vi.fn()
    const { user } = renderWithRouter(<BookingCutoffFields value={3} onChange={onChange} />)
    expect(screen.getByRole('group', { name: 'How much notice do you need?' })).toBeInTheDocument()
    expect(screen.getByLabelText('3 hr')).toBeChecked()
    expect(
      screen.getByText('For a Saturday 7 pm session, the last booking is at 4 pm that day.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('More notice gives you time to buy materials or prepare add-ons.'),
    ).toBeInTheDocument()
    await user.click(screen.getByLabelText('2 days'))
    expect(onChange).toHaveBeenCalledWith(48)
  })

  it('shows the example for the notice already chosen', () => {
    renderWithRouter(<BookingCutoffFields value={48} onChange={() => {}} />)
    expect(screen.getByLabelText('2 days')).toBeChecked()
    expect(screen.getByText(/the last booking is Thursday at 7 pm/)).toBeInTheDocument()
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
    expect(screen.getByText(/Anything you.d like .+ to know\./)).toBeInTheDocument()
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
