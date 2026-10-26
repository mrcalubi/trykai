import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
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

  it('can render an external href item', async () => {
    const { user } = renderMenu([{ label: 'Report review', href: 'mailto:hello@trykai.sg' }])

    await user.click(screen.getByRole('button', { name: 'More actions' }))
    expect(screen.getByRole('menuitem', { name: 'Report review' })).toHaveAttribute(
      'href',
      'mailto:hello@trykai.sg'
    )
  })

  it('uses a custom trigger icon when given one', () => {
    render(
      <MemoryRouter>
        <OverflowMenu icon="⋮" items={[{ label: 'Report review', href: 'mailto:hello@trykai.sg' }]} />
      </MemoryRouter>
    )
    expect(screen.getByRole('button', { name: 'More actions' })).toHaveTextContent('⋮')
  })

  it('does not render a trigger when there are no items', () => {
    render(
      <MemoryRouter>
        <OverflowMenu items={[]} />
      </MemoryRouter>
    )
    expect(screen.queryByRole('button', { name: 'More actions' })).not.toBeInTheDocument()
  })

  it('sizes the menu to its items and centres each label in the highlight', () => {
    const css = readFileSync(resolve(import.meta.dirname, '../../index.css'), 'utf8')
    expect(css).toMatch(/\.ui-overflow__menu \{[\s\S]*?width:\s*max-content/)
    expect(css).toMatch(
      /\.ui-overflow__item \{[\s\S]*?display:\s*flex[\s\S]*?align-items:\s*center[\s\S]*?padding:\s*10px 14px/
    )
    expect(css).toMatch(/\.ui-overflow__item:hover,\s*\.ui-overflow__item:focus-visible/)
    expect(css).not.toMatch(/\.ui-overflow__item:focus \{/)
  })

  it('focuses the first item on open so keyboard users can move from there', async () => {
    const { user } = renderMenu([
      { label: 'View listing', to: '/listings/l-1' },
      { label: 'Edit', to: '/edit-listing/l-1' },
    ])

    await user.click(screen.getByRole('button', { name: 'More actions' }))
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
