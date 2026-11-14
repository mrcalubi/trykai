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


function Harness({ initial = [], fieldHints }) {
  const [addons, setAddons] = useState(initial)
  return <ListingAddonsEditor addons={addons} onChange={setAddons} fieldHints={fieldHints} />
}

function renderHarness(initial, options) {
  return renderWithRouter(<Harness initial={initial} {...options} />)
}

const MORE = 'Description, photo and limit · optional'

describe('ListingAddonsEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('starts empty: one line on what add-ons are and one button', () => {
    renderEditor([])
    expect(screen.getByText(/Extras guests can add when they book/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add an add-on' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Premium materials' })).not.toBeInTheDocument()
    expect(screen.queryByText(/of 3/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Group discounts come off/)).not.toBeInTheDocument()
  })

  it('groups the ideas by how they are charged and starts one per guest', async () => {
    const { user, onChange } = renderEditor([])
    await user.click(screen.getByRole('button', { name: 'Add an add-on' }))
    expect(screen.getByText('Charged per guest')).toBeInTheDocument()
    expect(screen.getByText('Charged once per booking · for occasions')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Premium materials' }))
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'Premium materials', unit: 'person' }),
    ])
  })

  it('starts an occasion idea as per booking and opens it to finish', async () => {
    const { user } = renderHarness([])
    await user.click(screen.getByRole('button', { name: 'Add an add-on' }))
    await user.click(screen.getByRole('button', { name: 'Birthday surprise' }))

    expect(screen.getByLabelText('Name')).toHaveValue('Birthday surprise')
    expect(screen.getByLabelText('Per booking')).toBeChecked()
    expect(screen.getByText(/Paid once, whatever the group size/)).toBeInTheDocument()
    expect(screen.queryByText('Start from an idea')).not.toBeInTheDocument()
  })

  it('fills a blank add-on from an idea instead of adding another', async () => {
    const { user } = renderHarness([emptyAddon()])
    await user.click(screen.getByRole('button', { name: 'Add an add-on' }))
    await user.click(screen.getByRole('button', { name: 'Take-home kit' }))
    expect(screen.getByLabelText('Name')).toHaveValue('Take-home kit')
    expect(screen.getByText('1 of 3')).toBeInTheDocument()
  })

  it('closes the ideas without adding anything', async () => {
    const { user, onChange } = renderEditor([])
    await user.click(screen.getByRole('button', { name: 'Add an add-on' }))
    await user.click(screen.getByRole('button', { name: 'Close ideas' }))
    expect(screen.queryByText('Start from an idea')).not.toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('writes one from scratch, asks for what is missing, then folds it into a row', async () => {
    const { user } = renderHarness([])
    await user.click(screen.getByRole('button', { name: 'Add an add-on' }))
    await user.click(screen.getByRole('button', { name: 'Write my own' }))
    await user.type(screen.getByLabelText('Name'), 'Clay pack')
    await user.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.getByText(ADDON_HINTS.price)).toBeInTheDocument()

    await user.type(screen.getByLabelText('You get in Singapore dollars'), '15')
    expect(screen.queryByText(ADDON_HINTS.price)).not.toBeInTheDocument()
    expect(screen.getByText('You get S$15 · guests pay S$17')).toBeInTheDocument()
    expect(
      screen.getByText(/If 2 guests a session pick Clay pack, that.s S\$30 more per session/),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Done' }))

    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument()
    expect(screen.getByText('Clay pack')).toBeInTheDocument()
    expect(screen.getByText('You get S$15 per guest · guests pay S$17')).toBeInTheDocument()
    expect(screen.getByText('1 of 3')).toBeInTheDocument()
    expect(screen.getByText(/Group discounts come off/)).toBeInTheDocument()
  })

  it('shows an unfinished add-on as a row that says what it needs', () => {
    renderEditor([emptyAddon({ name: 'Kit' }), emptyAddon()])
    expect(screen.getByText('Needs a price')).toBeInTheDocument()
    expect(screen.getByText('Untitled add-on')).toBeInTheDocument()
    expect(screen.getByText('Needs a name and a price')).toBeInTheDocument()
  })

  it('edits and removes from the row', async () => {
    const { user } = renderHarness([
      emptyAddon({ name: 'Kit', price: '12' }),
      emptyAddon({ name: 'Wrap', price: '5', unit: 'booking' }),
    ])
    expect(screen.getByText('You get S$5 per booking · guests pay S$6')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Remove Wrap' }))
    expect(screen.queryByText('Wrap')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Edit Kit' }))
    expect(screen.getByLabelText('Name')).toHaveValue('Kit')
    await user.click(screen.getByLabelText('Per booking'))
    expect(screen.getByText(/Paid once, whatever the group size/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Remove' }))
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add an add-on' })).toBeInTheDocument()
  })

  it('hides Add an add-on at 3', () => {
    renderEditor([
      emptyAddon({ name: 'A', price: '15' }),
      emptyAddon({ name: 'B', price: '10' }),
      emptyAddon({ name: 'C', price: '8' }),
    ])
    expect(screen.queryByRole('button', { name: 'Add an add-on' })).not.toBeInTheDocument()
    expect(screen.getByText('3 of 3')).toBeInTheDocument()
  })

  it('opens an add-on that has validation hints from the page', () => {
    renderEditor([emptyAddon({ name: 'A', price: '15' }), emptyAddon()], {
      fieldHints: {
        'addon-1-name': ADDON_HINTS.name,
        'addon-1-price': ADDON_HINTS.price,
      },
    })
    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveValue('')
    expect(screen.getByText(ADDON_HINTS.name)).toBeInTheDocument()
    expect(screen.getByText(ADDON_HINTS.price)).toBeInTheDocument()
  })

  it('keeps the optional extras folded until asked, open when one is set', async () => {
    const { user } = renderHarness([
      emptyAddon({ name: 'Kit', price: '12' }),
      emptyAddon({ name: 'Wrap', price: '5', description: 'Ribbon and a card' }),
    ])
    await user.click(screen.getByRole('button', { name: 'Edit Kit' }))
    const more = screen.getByText(MORE).closest('details')
    expect(more).not.toHaveAttribute('open')
    await user.click(screen.getByText(MORE))
    expect(more).toHaveAttribute('open')

    await user.click(screen.getByRole('button', { name: 'Edit Wrap' }))
    expect(screen.getByText(MORE).closest('details')).toHaveAttribute('open')
  })

  it('sets and clears a session limit', async () => {
    const onChange = vi.fn()
    const { user } = renderEditor(
      [emptyAddon({ name: 'Kit', price: '12', sessionLimitEnabled: true, sessionLimit: '4' })],
      {
        fieldHints: { 'addon-0-limit': ADDON_HINTS.sessionLimit },
        onChange,
      },
    )
    expect(screen.getByText(ADDON_HINTS.sessionLimit)).toBeInTheDocument()
    await user.type(screen.getByRole('spinbutton', { name: 'Limit per session' }), '5')
    expect(onChange).toHaveBeenLastCalledWith([
      expect.objectContaining({ sessionLimit: '45' }),
    ])
    await user.click(screen.getByRole('checkbox', { name: 'Limit per session' }))
    expect(onChange).toHaveBeenLastCalledWith([
      expect.objectContaining({ sessionLimitEnabled: false, sessionLimit: '' }),
    ])
  })

  it('adds and removes a photo through the mocked uploader', async () => {
    const { user } = renderHarness([emptyAddon({ name: 'Kit', price: '12' })])
    await user.click(screen.getByRole('button', { name: 'Edit Kit' }))
    await user.click(screen.getByText(MORE))
    const file = new File(['binary'], 'kit.png', { type: 'image/png' })
    await user.upload(screen.getByLabelText('Add photo'), file)

    expect(await screen.findByRole('button', { name: 'Change' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Done' }))
    expect(document.querySelector('.addon-row__thumb')).toHaveAttribute('src', 'blob:addon-photo')

    await user.click(screen.getByRole('button', { name: 'Edit Kit' }))
    await user.click(screen.getByRole('button', { name: 'Remove photo' }))
    expect(screen.getByLabelText('Add photo')).toBeInTheDocument()
  })
})
