import { screen } from '@testing-library/react'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ListingAddonsEditor from './ListingAddonsEditor'
import { ADDON_HINTS, emptyAddon } from '../lib/listingAddons'
import { renderWithRouter } from '../test/render'

vi.mock('../lib/listingPhotos', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    filesToPhotos: vi.fn(async (fileList) => {
      const file = Array.from(fileList || [])[0]
      if (!file) return { photos: [], error: null }
      return {
        photos: [
          {
            id: 'addon-photo-1',
            file,
            previewUrl: 'blob:addon-photo',
            remoteUrl: null,
          },
        ],
        error: null,
      }
    }),
  }
})

function renderEditor(addons, { fieldHints = {}, onChange = vi.fn() } = {}) {
  const view = renderWithRouter(
    <ListingAddonsEditor addons={addons} onChange={onChange} fieldHints={fieldHints} />,
  )
  return { ...view, onChange }
}

describe('ListingAddonsEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('starts an add-on from an idea chip', async () => {
    const { user, onChange } = renderEditor([])
    await user.click(screen.getByRole('button', { name: 'Premium materials' }))
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'Premium materials', unit: 'person' }),
    ])
  })

  it('starts an occasion chip as per booking', async () => {
    const { user, onChange } = renderEditor([])
    await user.click(screen.getByRole('button', { name: 'Birthday surprise' }))
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'Birthday surprise', unit: 'booking' }),
    ])
  })

  it('hides + Add an add-on at 3 and shows the live pill', async () => {
    const addons = [
      emptyAddon({ name: 'A', price: '15' }),
      emptyAddon({ name: 'B', price: '10' }),
      emptyAddon({ name: 'C', price: '8' }),
    ]
    const { user } = renderEditor(addons)

    expect(screen.queryByRole('button', { name: '+ Add an add-on' })).not.toBeInTheDocument()
    expect(screen.getByText('3 of 3')).toBeInTheDocument()
    expect(screen.getByText('You get S$15 · guests pay S$17')).toBeInTheDocument()
    expect(
      screen.getByText(
        'If 2 guests a session pick A, that\'s S$30 more per session for you.',
      ),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Premium materials' }))
    expect(screen.getByRole('button', { name: 'Premium materials' })).toBeDisabled()
  })

  it('shows validation hints in the existing field-hint style', () => {
    renderEditor([emptyAddon()], {
      fieldHints: {
        'addon-0-name': ADDON_HINTS.name,
        'addon-0-price': ADDON_HINTS.price,
      },
    })
    expect(screen.getByText(ADDON_HINTS.name)).toBeInTheDocument()
    expect(screen.getByText(ADDON_HINTS.price)).toBeInTheDocument()
  })

  it('adds a photo through the mocked uploader', async () => {
    function Harness() {
      const [addons, setAddons] = useState([emptyAddon({ name: 'Kit', price: '12' })])
      return <ListingAddonsEditor addons={addons} onChange={setAddons} />
    }
    const { user } = renderWithRouter(<Harness />)
    const file = new File(['binary'], 'kit.png', { type: 'image/png' })
    await user.upload(screen.getByLabelText('Add photo'), file)

    expect(await screen.findByRole('button', { name: 'Change' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove photo' })).toBeInTheDocument()
  })
})
