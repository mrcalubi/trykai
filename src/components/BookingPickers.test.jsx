import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import BookingPickers from './BookingPickers'

const PLACES = [
  { id: 'a', label: 'Thomson studio', area: 'Bishan', name: 'Thomson studio · Bishan' },
  { id: 'b', label: '', area: 'Bedok', name: 'Bedok' },
]
const CLASSES = [
  { id: 't1', name: 'Mug', photoUrl: 'https://cdn.test/mug.jpg' },
  { id: 't2', name: 'Plate' },
]

describe('BookingPickers', () => {
  it('shows nothing when there is nothing to pick', () => {
    const { container } = render(
      <BookingPickers sessions={[]} places={[PLACES[0]]} classes={[CLASSES[0]]} onPlace={vi.fn()} onClass={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('shows only the field there is a choice for, without counts while dates load', async () => {
    const user = userEvent.setup()
    render(<BookingPickers sessions={null} classes={CLASSES} onPlace={vi.fn()} onClass={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /^Where/ })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: "What you'll make: Any of 2 classes" }))
    const list = screen.getByRole('dialog', { name: "What you'll make" })
    expect(within(list).getAllByText('Pick a class')).toHaveLength(2) // sheet subtitle and list label
    expect(list.querySelector('.pick-option__meta')).toBeNull()
    expect(list.querySelector('img.pick-option__thumb--photo')).toHaveAttribute('src', 'https://cdn.test/mug.jpg')
    expect(list.querySelector('.pick-panel__note')).toBeNull()
  })

  it('toggles a list from its field and switches between the two', async () => {
    const user = userEvent.setup()
    const onPlace = vi.fn()
    render(<BookingPickers sessions={[]} places={PLACES} classes={CLASSES} placeId="a" onPlace={onPlace} onClass={vi.fn()} />)

    const where = screen.getByRole('button', { name: 'Where: Thomson studio, Bishan' })
    await user.click(where)
    expect(screen.getByRole('dialog', { name: 'Where' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Thomson studio/, pressed: true })).toHaveFocus()
    await user.click(where)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^What you'll make/ }))
    expect(screen.getByRole('dialog', { name: "What you'll make" })).toHaveTextContent('At Thomson studio, Bishan')
    await user.click(where)
    expect(screen.getByRole('dialog', { name: 'Where' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Bedok/ }))
    expect(onPlace).toHaveBeenCalledWith('b')
    expect(where).toHaveFocus()
  })
})
