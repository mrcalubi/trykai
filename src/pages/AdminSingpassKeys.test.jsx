import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import AdminSingpassKeys from './AdminSingpassKeys'
import { renderWithRouter } from '../test/render'
import { generateSingpassKeys } from '../lib/singpassKeys'

vi.mock('../lib/singpassKeys', () => ({ generateSingpassKeys: vi.fn() }))

describe('AdminSingpassKeys', () => {
  it('shows the two private secrets and the public set after generating', async () => {
    generateSingpassKeys.mockResolvedValue({
      signingKey: '{"kid":"trykai-sig-1"}',
      encryptionKey: '{"kid":"trykai-enc-1"}',
      jwks: '{"keys":[]}',
    })
    const { user } = renderWithRouter(<AdminSingpassKeys />)

    await user.click(screen.getByRole('button', { name: 'Generate keys' }))

    expect(await screen.findByText('1. Supabase secret SINGPASS_SIGNING_KEY')).toBeInTheDocument()
    expect(screen.getByText('2. Supabase secret SINGPASS_ENCRYPTION_KEY')).toBeInTheDocument()
    expect(screen.getByText('3. Singpass app JWKS (public)')).toBeInTheDocument()
    expect(screen.getByDisplayValue('{"kid":"trykai-sig-1"}')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Copy' })).toHaveLength(3)
  })

  it('copies a value to the clipboard', async () => {
    generateSingpassKeys.mockResolvedValue({ signingKey: 'S', encryptionKey: 'E', jwks: 'J' })
    const { user } = renderWithRouter(<AdminSingpassKeys />)
    await user.click(screen.getByRole('button', { name: 'Generate keys' }))

    await user.click((await screen.findAllByRole('button', { name: 'Copy' }))[2])

    expect(await navigator.clipboard.readText()).toBe('J')
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument()
  })

  it('says why when keys cannot be made', async () => {
    generateSingpassKeys.mockRejectedValue(new Error('This browser cannot generate keys.'))
    const { user } = renderWithRouter(<AdminSingpassKeys />)

    await user.click(screen.getByRole('button', { name: 'Generate keys' }))

    expect(await screen.findByText('This browser cannot generate keys.')).toBeInTheDocument()
  })
})
