import { screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Home from './Home'
import { supabase } from '../lib/supabase'
import { renderWithRouter } from '../test/render'
import { makeListing } from '../test/fixtures'

vi.mock('../lib/supabase')

const LATTE = makeListing({
  id: 'l-1',
  title: 'Latte art',
  category: 'Food',
  area: 'Tiong Bahru',
  price_per_person: 4500,
})
const BOXING = makeListing({
  id: 'l-2',
  title: 'Boxing basics',
  category: 'Fitness',
  area: 'Bedok',
  price_per_person: 3000,
})
const POTTERY = makeListing({
  id: 'l-3',
  title: 'Pottery hour',
  category: 'Arts',
  area: 'Bedok',
  price_per_person: 6000,
})

function givenListings(listings) {
  supabase.__on('listings', 'select', { data: listings, error: null })
}

function listingTitles() {
  return screen
    .getAllByRole('heading', { level: 2 })
    .map((heading) => heading.textContent)
}

beforeEach(() => {
  supabase.__reset()
})

describe('Home loading and error states', () => {
  it('shows a loading message until the listings arrive', () => {
    givenListings([LATTE])
    renderWithRouter(<Home />)
    expect(screen.getByText('Loading listings…')).toBeInTheDocument()
  })

  it('surfaces a fetch failure to the user', async () => {
    supabase.__on('listings', 'select', { data: null, error: { message: 'network down' } })
    renderWithRouter(<Home />)

    expect(await screen.findByText('network down')).toBeInTheDocument()
    expect(screen.queryByText('Loading listings…')).not.toBeInTheDocument()
  })

  it('invites the user back when there is nothing to browse', async () => {
    givenListings([])
    renderWithRouter(<Home />)

    expect(await screen.findByText('No listings yet. Check back soon.')).toBeInTheDocument()
  })
})

describe('Home listing grid', () => {
  it('renders a card per active listing', async () => {
    givenListings([LATTE, BOXING])
    renderWithRouter(<Home />)

    expect(await screen.findByText('Latte art')).toBeInTheDocument()
    expect(screen.getByText(/\$51\/person/)).toBeInTheDocument()
    expect(screen.getByText('Boxing basics')).toBeInTheDocument()
  })

  it('only asks the database for active listings, newest first', async () => {
    givenListings([LATTE])
    renderWithRouter(<Home />)
    await screen.findByText('Latte art')

    const call = supabase.__lastCall('listings', 'select')
    expect(call.filters).toContainEqual({ method: 'eq', column: 'is_active', value: true })
    expect(call.chain).toContainEqual({
      method: 'order',
      args: ['created_at', { ascending: false }],
    })
  })
})

describe('Home filters', () => {
  it('offers an All pill plus one per category, alphabetically', async () => {
    givenListings([LATTE, BOXING, POTTERY])
    renderWithRouter(<Home />)
    await screen.findByText('Latte art')

    const pills = within(document.querySelector('.filter-pills'))
      .getAllByRole('button')
      .map((button) => button.textContent)
    expect(pills).toEqual(['All', 'Arts', 'Fitness', 'Food'])
  })

  it('narrows the grid to the chosen category', async () => {
    givenListings([LATTE, BOXING, POTTERY])
    const { user } = renderWithRouter(<Home />)
    await screen.findByText('Latte art')

    await user.click(screen.getByRole('button', { name: 'Fitness' }))

    expect(listingTitles()).toEqual(['Boxing basics'])
  })

  it('narrows the grid to the chosen area', async () => {
    givenListings([LATTE, BOXING, POTTERY])
    const { user } = renderWithRouter(<Home />)
    await screen.findByText('Latte art')

    await user.selectOptions(screen.getByLabelText('Filter by area'), 'Bedok')

    expect(listingTitles()).toEqual(['Boxing basics', 'Pottery hour'])
  })

  it('combines the category and area filters', async () => {
    givenListings([LATTE, BOXING, POTTERY])
    const { user } = renderWithRouter(<Home />)
    await screen.findByText('Latte art')

    await user.click(screen.getByRole('button', { name: 'Arts' }))
    await user.selectOptions(screen.getByLabelText('Filter by area'), 'Bedok')

    expect(listingTitles()).toEqual(['Pottery hour'])
  })

  it('explains when a filter combination matches nothing', async () => {
    givenListings([LATTE, BOXING])
    const { user } = renderWithRouter(<Home />)
    await screen.findByText('Latte art')

    await user.click(screen.getByRole('button', { name: 'Food' }))
    await user.selectOptions(screen.getByLabelText('Filter by area'), 'Bedok')

    expect(screen.getByText('No listings match your filters.')).toBeInTheDocument()
  })

  it('restores the full grid when All is selected again', async () => {
    givenListings([LATTE, BOXING])
    const { user } = renderWithRouter(<Home />)
    await screen.findByText('Latte art')

    await user.click(screen.getByRole('button', { name: 'Fitness' }))
    await user.click(screen.getByRole('button', { name: 'All' }))

    expect(listingTitles()).toEqual(['Latte art', 'Boxing basics'])
  })

  it('lists each area once even when several listings share it', async () => {
    givenListings([LATTE, BOXING, POTTERY])
    renderWithRouter(<Home />)
    await screen.findByText('Latte art')

    const options = within(screen.getByLabelText('Filter by area'))
      .getAllByRole('option')
      .map((option) => option.textContent)
    expect(options).toEqual(['All areas', 'Bedok', 'Tiong Bahru'])
  })

  it('ignores listings with no category when building the pills', async () => {
    givenListings([LATTE, makeListing({ id: 'l-9', title: 'Uncategorised', category: null })])
    renderWithRouter(<Home />)
    await screen.findByText('Latte art')

    const pills = within(document.querySelector('.filter-pills'))
      .getAllByRole('button')
      .map((button) => button.textContent)
    expect(pills).toEqual(['All', 'Food'])
  })
})
