import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import ListingLocationsEditor from './ListingLocationsEditor'
import { emptyLocation, MULTI_LOCATION_CONFIRM } from '../lib/listingLocations'

const JURONG = emptyLocation({
  key: 'loc-j',
  id: 'loc-j',
  label: 'Jurong studio',
  area: 'Jurong East',
  fullAddress: 'Blk 2 Jurong Street',
})

function Harness({ multi = false, extras = [], dates = {}, available = true, hints = {} }) {
  const [multiLocation, setMultiLocation] = useState(multi)
  const [list, setList] = useState(extras)
  const [label, setLabel] = useState('')
  return (
    <>
      <ListingLocationsEditor
        area="Tampines"
        onAreaChange={() => {}}
        fullAddress="Blk 1 Tampines Street"
        onFullAddressChange={() => {}}
        arrivalInstructions=""
        onArrivalChange={() => {}}
        primaryId="loc-t"
        primaryLabel={label}
        onPrimaryLabelChange={setLabel}
        multiLocation={multiLocation}
        onMultiLocationChange={setMultiLocation}
        extras={list}
        onExtrasChange={setList}
        fieldHints={hints}
        allowChangeAddress
        datesByLocationId={dates}
        available={available}
      />
      <output data-testid="state">{JSON.stringify({ multiLocation, count: list.length, label })}</output>
    </>
  )
}

const state = () => JSON.parse(screen.getByTestId('state').textContent)

describe('ListingLocationsEditor', () => {
  it('starts as one location, with an offer to add more', () => {
    render(<Harness />)
    expect(screen.getByText('Blk 1 Tampines Street')).toBeInTheDocument()
    expect(screen.getByText('Run this at more than one place?')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Location 1' })).not.toBeInTheDocument()
  })

  it('turns on only after the host ticks that they can run every location at once', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Add a location' }))

    const confirm = screen.getByRole('group', { name: 'Multiple locations' })
    expect(within(confirm).getByText(/run this session at every location at the same time/)).toBeInTheDocument()
    expect(within(confirm).getByText('Guests are told your teacher may be a team member.')).toBeInTheDocument()
    const turnOn = within(confirm).getByRole('button', { name: 'Turn on multiple locations' })
    expect(turnOn).toBeDisabled()

    await user.click(within(confirm).getByRole('checkbox', { name: MULTI_LOCATION_CONFIRM }))
    await user.click(turnOn)
    expect(state()).toMatchObject({ multiLocation: true, count: 1 })
    expect(screen.getByRole('heading', { name: 'Location 1' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Location 2' })).toBeInTheDocument()
    expect(screen.getByText('2 of 4')).toBeInTheDocument()
  })

  it('cancels without turning anything on', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Add a location' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(state().multiLocation).toBe(false)
    expect(screen.getByRole('button', { name: 'Add a location' })).toBeInTheDocument()
  })

  it('adds locations up to 4 and removes one without dates', async () => {
    const user = userEvent.setup()
    render(<Harness multi extras={[JURONG]} />)
    await user.click(screen.getByRole('button', { name: 'Add another location' }))
    await user.click(screen.getByRole('button', { name: 'Add another location' }))
    expect(screen.getByText('4 of 4')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add another location' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Remove location 4' }))
    expect(state().count).toBe(2)
  })

  it('keeps a location that has dates, and says how to remove it', () => {
    render(<Harness multi extras={[JURONG]} dates={{ 'loc-j': 3, 'loc-t': 2 }} />)
    expect(screen.queryByRole('button', { name: 'Remove location 2' })).not.toBeInTheDocument()
    expect(screen.getByText('3 upcoming dates')).toBeInTheDocument()
    expect(screen.getByText('2 upcoming dates')).toBeInTheDocument()
    expect(screen.getByText('To remove this location, first remove its dates in Hosting.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Turn off multiple locations' })).toBeDisabled()
  })

  it('turns off, dropping locations that have no dates', async () => {
    const user = userEvent.setup()
    render(<Harness multi extras={[JURONG]} />)
    await user.click(screen.getByRole('button', { name: 'Turn off multiple locations' }))
    expect(state()).toMatchObject({ multiLocation: false, count: 0 })
    expect(screen.getByText('Run this at more than one place?')).toBeInTheDocument()
  })

  it('names location 1 and shows each location its hints', async () => {
    const user = userEvent.setup()
    render(
      <Harness
        multi
        extras={[emptyLocation({ key: 'new' })]}
        hints={{ 'location-0-fullAddress': 'Add the address for this location.' }}
      />,
    )
    const first = screen.getByRole('heading', { name: 'Location 1' }).closest('li')
    await user.type(within(first).getByLabelText(/Name guests see/), 'Home studio')
    expect(state().label).toBe('Home studio')
    const second = screen.getByRole('heading', { name: 'Location 2' }).closest('li')
    expect(within(second).getByText('Add the address for this location.')).toBeInTheDocument()
    expect(within(second).getByLabelText('Postal code')).toBeInTheDocument()
  })

  it('offers nothing more before 00059 is applied', () => {
    render(<Harness available={false} />)
    expect(screen.queryByText('Run this at more than one place?')).not.toBeInTheDocument()
  })
})
