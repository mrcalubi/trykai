import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import PhotoLightbox from './PhotoLightbox'

const PHOTOS = ['https://cdn.test/a.jpg', 'https://cdn.test/b.jpg', 'https://cdn.test/c.jpg']

function OpenableLightbox({ photos = PHOTOS, title = 'Latte art', startIndex = 0 }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open photos
      </button>
      {open && (
        <PhotoLightbox
          photos={photos}
          title={title}
          startIndex={startIndex}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

describe('PhotoLightbox', () => {
  it('is a modal dialog showing the photo that opened it', () => {
    render(
      <PhotoLightbox photos={PHOTOS} title="Latte art" startIndex={1} onClose={vi.fn()} />
    )

    const dialog = screen.getByRole('dialog', { name: 'Latte art photos' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByRole('img', { name: 'Latte art 2' })).toHaveAttribute(
      'src',
      'https://cdn.test/b.jpg'
    )
    expect(screen.getByText('2 / 3')).toBeInTheDocument()
  })

  it('moves through every photo and wraps around', async () => {
    const user = userEvent.setup()
    render(<PhotoLightbox photos={PHOTOS} title="Latte art" startIndex={2} onClose={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Next photo' }))
    expect(screen.getByRole('img', { name: 'Latte art 1' })).toBeInTheDocument()
    expect(screen.getByText('1 / 3')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Previous photo' }))
    expect(screen.getByRole('img', { name: 'Latte art 3' })).toBeInTheDocument()
    expect(screen.getByText('3 / 3')).toBeInTheDocument()
  })

  it('hides next and previous when there is only one photo', () => {
    render(
      <PhotoLightbox photos={['https://cdn.test/a.jpg']} title="Latte art" onClose={vi.fn()} />
    )

    expect(screen.getByText('1 / 1')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Next photo' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Previous photo' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
  })

  it('closes from the X, the backdrop, and Escape', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const { rerender } = render(
      <PhotoLightbox photos={PHOTOS} title="Latte art" onClose={onClose} />
    )

    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)

    onClose.mockClear()
    fireEvent.click(screen.getByRole('dialog'))
    expect(onClose).toHaveBeenCalledTimes(1)

    onClose.mockClear()
    await user.click(screen.getByRole('img', { name: 'Latte art 1' }))
    expect(onClose).not.toHaveBeenCalled()

    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)

    rerender(
      <PhotoLightbox photos={['https://cdn.test/a.jpg']} title="Latte art" onClose={onClose} />
    )
    onClose.mockClear()
    await user.keyboard('{ArrowRight}')
    await user.keyboard('{ArrowLeft}')
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('img', { name: 'Latte art 1' })).toBeInTheDocument()
  })

  it('moves between photos with the arrow keys', async () => {
    const user = userEvent.setup()
    render(<PhotoLightbox photos={PHOTOS} title="Latte art" startIndex={0} onClose={vi.fn()} />)

    await user.keyboard('{ArrowRight}')
    expect(screen.getByText('2 / 3')).toBeInTheDocument()
    await user.keyboard('{ArrowLeft}')
    expect(screen.getByText('1 / 3')).toBeInTheDocument()
  })

  it('moves focus into the dialog and back to the opener', async () => {
    const user = userEvent.setup()
    render(<OpenableLightbox />)

    const opener = screen.getByRole('button', { name: 'Open photos' })
    await user.click(opener)

    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus()

    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
  })

  it('traps tab inside the dialog', async () => {
    const user = userEvent.setup()
    render(
      <>
        <button type="button">Outside</button>
        <PhotoLightbox photos={PHOTOS} title="Latte art" onClose={vi.fn()} />
      </>
    )

    const close = screen.getByRole('button', { name: 'Close' })
    const prev = screen.getByRole('button', { name: 'Previous photo' })
    const next = screen.getByRole('button', { name: 'Next photo' })

    expect(close).toHaveFocus()
    await user.tab()
    expect(prev).toHaveFocus()
    await user.tab()
    expect(next).toHaveFocus()
    await user.tab()
    expect(close).toHaveFocus()
    await user.tab({ shift: true })
    expect(next).toHaveFocus()

    screen.getByRole('button', { name: 'Outside' }).focus()
    await user.tab()
    expect(close).toHaveFocus()

    screen.getByRole('button', { name: 'Outside' }).focus()
    await user.tab({ shift: true })
    expect(next).toHaveFocus()
  })

  it('locks page scroll while open and restores it on close', async () => {
    const user = userEvent.setup()
    document.body.style.overflow = 'auto'
    document.documentElement.style.overflow = 'auto'
    render(<OpenableLightbox photos={['https://cdn.test/a.jpg']} />)

    await user.click(screen.getByRole('button', { name: 'Open photos' }))
    expect(document.body).toHaveClass('lightbox-open')
    expect(document.body.style.overflow).toBe('hidden')
    expect(document.documentElement.style.overflow).toBe('hidden')

    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(document.body).not.toHaveClass('lightbox-open')
    expect(document.body.style.overflow).toBe('auto')
    expect(document.documentElement.style.overflow).toBe('auto')

    document.body.style.overflow = ''
    document.documentElement.style.overflow = ''
  })

  it('renders nothing when there are no photos', () => {
    const { container } = render(<PhotoLightbox photos={[]} title="Latte art" onClose={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })
})
