import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import SessionTypesEditor from './SessionTypesEditor'
import { emptySessionType } from '../lib/sessionTypes'

vi.mock('../lib/listingPhotos', () => ({
  filesToPhotos: vi.fn(async () => ({ photos: [{ id: 'p1', previewUrl: 'blob:p1' }] })),
}))

function Harness({ initial = [], hints = {} }) {
  const [types, setTypes] = useState(initial)
  return (
    <>
      <SessionTypesEditor types={types} onChange={setTypes} fieldHints={hints} />
      <output data-testid="state">{JSON.stringify(types.map((type) => type.name))}</output>
    </>
  )
}

describe('SessionTypesEditor', () => {
  it('adds, names and removes types, up to 4', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    expect(screen.getByText('0 of 4')).toBeInTheDocument()
    for (let i = 0; i < 4; i += 1) {
      await user.click(screen.getByRole('button', { name: '+ Add a session type' }))
    }
    expect(screen.queryByRole('button', { name: '+ Add a session type' })).not.toBeInTheDocument()
    await user.type(screen.getAllByLabelText('Name')[0], 'Bouquet')
    expect(screen.getByTestId('state')).toHaveTextContent('["Bouquet","","",""]')
    await user.click(screen.getAllByRole('button', { name: 'Remove' })[1])
    expect(screen.getByText('3 of 4')).toBeInTheDocument()
    expect(screen.getByText(/Removing a type keeps it on dates/)).toBeInTheDocument()
  })

  it('shows a name hint and edits the description', async () => {
    const user = userEvent.setup()
    render(<Harness initial={[emptySessionType()]} hints={{ 'type-0-name': 'Give this type a name.' }} />)
    expect(screen.getByText('Give this type a name.')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Short description'), 'Big and bold')
    expect(screen.getByLabelText('Short description')).toHaveValue('Big and bold')
  })

  it('adds, changes and removes a photo', async () => {
    const user = userEvent.setup()
    render(<Harness initial={[emptySessionType({ name: 'A' })]} />)
    const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' })
    await user.upload(screen.getByLabelText('Add photo'), file)
    expect(await screen.findByRole('button', { name: 'Remove photo' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Change' }))
    await user.click(screen.getByRole('button', { name: 'Remove photo' }))
    expect(screen.getByLabelText('Add photo')).toBeInTheDocument()
  })
})
