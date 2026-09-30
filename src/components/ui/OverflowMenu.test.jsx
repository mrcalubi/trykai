import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import OverflowMenu from './OverflowMenu'

function renderMenu(items) {
  const user = userEvent.setup({ delay: null })
  const utils = render(
    <MemoryRouter>
      <OverflowMenu items={items} />
    </MemoryRouter>
  )
  return { user, ...utils }
}

describe('OverflowMenu', () => {
  it('stays closed until the trigger is pressed, then lists the actions', async () => {
    const onDelete = vi.fn()
    const { user } = renderMenu([
      { label: 'View listing', to: '/listings/l-1' },
      { label: 'Edit', to: '/edit-listing/l-1' },
      { label: 'Delete', destructive: true, onSelect: onDelete },
    ])

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'More actions' }))

    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'View listing' })).toHaveAttribute(
      'href',
      '/listings/l-1'
    )
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toHaveAttribute(
      'href',
      '/edit-listing/l-1'
    )
    expect(screen.getByRole('menuitem', { name: 'Delete' }).className).toContain(
      'ui-overflow__item--destructive'
    )
  })

  it('closes on Escape and returns focus to the trigger', async () => {
    const { user } = renderMenu([{ label: 'Edit', to: '/edit-listing/l-1' }])

    const trigger = screen.getByRole('button', { name: 'More actions' })
    await user.click(trigger)
    expect(screen.getByRole('menu')).toBeInTheDocument()

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('walks items with the arrow keys', async () => {
    const { user } = renderMenu([
      { label: 'View listing', to: '/listings/l-1' },
      { label: 'Edit', to: '/edit-listing/l-1' },
      { label: 'Delete', onSelect: vi.fn() },
    ])

    await user.click(screen.getByRole('button', { name: 'More actions' }))
    expect(screen.getByRole('menuitem', { name: 'View listing' })).toHaveFocus()

    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toHaveFocus()

    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveFocus()

    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'View listing' })).toHaveFocus()
  })

  it('runs the action and closes after a choice', async () => {
    const onDelete = vi.fn()
    const { user } = renderMenu([{ label: 'Delete', onSelect: onDelete }])

    await user.click(screen.getByRole('button', { name: 'More actions' }))
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }))

    expect(onDelete).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})
