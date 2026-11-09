import { useCallback, useEffect, useState } from 'react'
import Button from './ui/Button'
import {
  disconnectTelegram,
  LINK_REFRESH_MS,
  telegramConnectLink,
  telegramStatus,
} from '../lib/telegram'

/**
 * Settings card for hosts. The link is fetched ahead of time so Connect is a
 * plain link (one tap, no popup blocker). Renders nothing until we know
 * Telegram is available.
 */
export default function TelegramConnect() {
  const [connected, setConnected] = useState(null)
  const [link, setLink] = useState('')
  const [opened, setOpened] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const refreshStatus = useCallback(async () => {
    const status = await telegramStatus()
    setConnected(status)
    if (status) setOpened(false)
  }, [])

  useEffect(() => {
    let cancelled = false
    telegramStatus().then((status) => {
      if (!cancelled) setConnected(status)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Not connected: keep a live link ready.
  useEffect(() => {
    if (connected !== false) return undefined
    let cancelled = false
    const load = async () => {
      const url = await telegramConnectLink()
      if (!cancelled) setLink(url ?? '')
    }
    load()
    const timer = setInterval(load, LINK_REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [connected])

  // Coming back from Telegram: check whether Start went through.
  useEffect(() => {
    if (!opened) return undefined
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshStatus()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [opened, refreshStatus])

  if (connected === null) return null
  if (connected === false && !link) return null

  const disconnect = async () => {
    setBusy(true)
    setError('')
    const ok = await disconnectTelegram()
    setBusy(false)
    if (ok) setConnected(false)
    else setError('Could not disconnect. Try again.')
  }

  return (
    <section className="edit-card" aria-labelledby="settings-telegram-heading">
      <h2 id="settings-telegram-heading" className="edit-card__title">
        Telegram updates
      </h2>
      {connected ? (
        <>
          <p className="edit-card__hint">Connected. Host updates also go to your Telegram.</p>
          <div className="settings-telegram__actions">
            <Button variant="secondary" onClick={disconnect} loading={busy} loadingLabel="Disconnecting">
              Disconnect
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="edit-card__hint">
            Get new bookings, cancellations and reminders on Telegram. Emails still come as usual.
          </p>
          <div className="settings-telegram__actions">
            <a
              className="ui-button ui-button--secondary"
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpened(true)}
            >
              Connect Telegram
            </a>
          </div>
          {opened ? (
            <p className="settings-hint" aria-live="polite">
              Tap Start in Telegram, then come back here.
            </p>
          ) : null}
        </>
      )}
      {error ? (
        <p className="settings-hint settings-hint--error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  )
}
