import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TelegramConnect from './TelegramConnect'
import * as telegram from '../lib/telegram'

vi.mock('../lib/telegram', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    telegramStatus: vi.fn(),
    telegramConnectLink: vi.fn(),
    disconnectTelegram: vi.fn(),
  }
})

const LINK = 'https://t.me/TryKaiBot?start=abcDEF123_-xyz7890'

describe('TelegramConnect', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    telegram.telegramConnectLink.mockResolvedValue(LINK)
  })

  it('shows nothing when Telegram is not available', async () => {
    telegram.telegramStatus.mockResolvedValue(null)
    const { container } = render(<TelegramConnect />)
    await waitFor(() => expect(telegram.telegramStatus).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
    expect(telegram.telegramConnectLink).not.toHaveBeenCalled()
  })

  it('shows nothing when the bot is not set up', async () => {
    telegram.telegramStatus.mockResolvedValue(false)
    telegram.telegramConnectLink.mockResolvedValue(null)
    const { container } = render(<TelegramConnect />)
    await waitFor(() => expect(telegram.telegramConnectLink).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it('offers a one-tap link, then checks again on return', async () => {
    telegram.telegramStatus.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    render(<TelegramConnect />)
    const link = await screen.findByRole('link', { name: 'Connect Telegram' })
    expect(link).toHaveAttribute('href', LINK)
    expect(link).toHaveAttribute('target', '_blank')
    expect(screen.getByText(/Emails still come as usual/)).toBeInTheDocument()

    link.addEventListener('click', (event) => event.preventDefault())
    await userEvent.click(link)
    expect(screen.getByText('Tap Start in Telegram, then come back here.')).toBeInTheDocument()

    await act(async () => {
      window.dispatchEvent(new Event('focus'))
    })
    expect(await screen.findByText('Connected. Host updates also go to your Telegram.')).toBeInTheDocument()
  })

  it('refreshes the link before the code expires', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    telegram.telegramStatus.mockResolvedValue(false)
    render(<TelegramConnect />)
    await screen.findByRole('link', { name: 'Connect Telegram' })
    expect(telegram.telegramConnectLink).toHaveBeenCalledTimes(1)
    await act(async () => {
      vi.advanceTimersByTime(telegram.LINK_REFRESH_MS)
    })
    expect(telegram.telegramConnectLink).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })

  it('disconnects', async () => {
    telegram.telegramStatus.mockResolvedValue(true)
    telegram.disconnectTelegram.mockResolvedValue(true)
    render(<TelegramConnect />)
    await userEvent.click(await screen.findByRole('button', { name: 'Disconnect' }))
    expect(await screen.findByRole('link', { name: 'Connect Telegram' })).toBeInTheDocument()
  })

  it('says so when disconnect fails', async () => {
    telegram.telegramStatus.mockResolvedValue(true)
    telegram.disconnectTelegram.mockResolvedValue(false)
    render(<TelegramConnect />)
    await userEvent.click(await screen.findByRole('button', { name: 'Disconnect' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not disconnect. Try again.')
  })
})
