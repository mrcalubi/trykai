import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import SessionTypesEditor from './SessionTypesEditor'
import { emptySessionType } from '../lib/sessionTypes'

vi.mock('../lib/listingPhotos', () => ({
  filesToPhotos: vi.fn(async () => ({ photos: [{ id: 'p1', previewUrl: 'blob:p1' }] })),
}))

const BOUQUET = emptySessionType({ key: 't1', id: 't1', name: 'Hand-tied bouquet', description: 'Wrap a bouquet' })
const TABLE = emptySessionType({ key: 't2', id: 't2', name: 'Table centrepiece', description: 'A low arrangement' })

function hoursFromNow(hours) {
  return new Date(Date.now() + hours * 3_600_000).toISOString()
}

const SESSIONS = [
  { id: 's1', type_id: 't1', starts_at: hoursFromNow(30) },
  { id: 's2', type_id: 't1', starts_at: hoursFromNow(80) },
  { id: 's3', type_id: 't2', starts_at: hoursFromNow(50) },
]

function Harness({ initial = [BOUQUET, TABLE], saved = initial, hints = {}, onSave = vi.fn(async () => true) }) {
  const [types, setTypes] = useState(initial)
  return (
    <MemoryRouter>
      <SessionTypesEditor
        types={types}
        savedTypes={saved}
        onChange={setTypes}
        onSave={onSave}
        fieldHints={hints}
        upcomingSessions={SESSIONS}
        listingId="listing-1"
        priceLabel="S$37"
      />
      <output data-testid="state">{JSON.stringify(types.map((type) => type.name))}</output>
    </MemoryRouter>
  )
}

const card = (name) => screen.getByText(name).closest('li')

describe('SessionTypesEditor', () => {
  it('sums up each class with its dates and a way to add more', () => {
    render(<Harness />)
    expect(screen.getByText('All classes cost the listing price, S$37.')).toBeInTheDocument()
    expect(screen.getByText('2 of 4')).toBeInTheDocument()
    expect(within(card('Hand-tied bouquet')).getByText(/^2 upcoming dates · next /)).toBeInTheDocument()
    expect(within(card('Table centrepiece')).getByText(/^1 upcoming date · next /)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Add dates for Hand-tied bouquet' })).toHaveAttribute(
      'href',
      '/hosting?add=listing-1&class=t1',
    )
    expect(screen.getByText('How classes and dates fit together')).toBeInTheDocument()
  })

  it('edits a class in place and saves it from the card', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn(async () => true)
    render(<Harness onSave={onSave} />)

    await user.click(screen.getByRole('button', { name: 'Edit Table centrepiece' }))
    expect(screen.getByRole('heading', { name: 'Editing: Table centrepiece' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Add another class/ })).not.toBeInTheDocument()
    await user.clear(screen.getByLabelText('Name'))
    await user.type(screen.getByLabelText('Name'), 'Centrepiece')
    expect(screen.getByTestId('state')).toHaveTextContent('["Hand-tied bouquet","Centrepiece"]')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSave).toHaveBeenCalledWith()
    expect(screen.queryByRole('heading', { name: /Editing:/ })).not.toBeInTheDocument()
  })

  it('cancels back to the saved class, and drops a new one', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole('button', { name: 'Edit Hand-tied bouquet' }))
    await user.type(screen.getByLabelText('Name'), ' XL')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByTestId('state')).toHaveTextContent('["Hand-tied bouquet","Table centrepiece"]')

    await user.click(screen.getByRole('button', { name: 'Add another class' }))
    expect(screen.getByRole('heading', { name: 'New class' })).toBeInTheDocument()
    expect(screen.getByText('3 of 4')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByText('2 of 4')).toBeInTheDocument()
  })

  it('says what removing does, asks, then removes and saves', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn(async () => true)
    render(<Harness onSave={onSave} />)

    await user.click(screen.getByRole('button', { name: 'Edit Hand-tied bouquet' }))
    expect(screen.getByText("New dates can't use it. Its 2 dates stay as they are.")).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Remove this class' }))
    expect(screen.getByText('Remove Hand-tied bouquet?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Yes, remove' }))

    expect(screen.getByTestId('state')).toHaveTextContent('["Table centrepiece"]')
    expect(onSave).toHaveBeenCalledWith({ sessionTypes: [TABLE] })
  })

  it('stops at 4 classes and shows a name hint', async () => {
    const user = userEvent.setup()
    const four = [BOUQUET, TABLE, emptySessionType({ key: 't3', id: 't3', name: 'Wreath' }), emptySessionType()]
    render(<Harness initial={four} saved={four.slice(0, 3)} hints={{ 'type-3-name': 'Give this class a name.' }} />)

    expect(screen.queryByRole('button', { name: /Add another class/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Edit class' }))
    expect(screen.getByText('Give this class a name.')).toBeInTheDocument()
  })

  it('adds, changes and removes a photo', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Edit Hand-tied bouquet' }))
    const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' })
    await user.upload(screen.getByLabelText('Add photo'), file)
    expect(await screen.findByRole('button', { name: 'Remove photo' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Remove photo' }))
    expect(screen.getByLabelText('Add photo')).toBeInTheDocument()
  })
})
