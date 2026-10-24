import verifyWithSingpass from '../assets/singpass/verify_with_singpass_full_black.svg'

/**
 * Singpass's official "Verify with Singpass" button, black variant (Singpass
 * button design specification, effective 1 September 2026). The label and
 * logo are Singpass's own artwork, unmodified; the button around it only
 * matches TryKai's full-width buttons. Singpass requires an accessible name,
 * since the label is part of the image.
 */
export default function SingpassButton({ onClick, busy = false }) {
  return (
    <button
      type="button"
      className="singpass-button"
      aria-label="Verify with Singpass"
      aria-busy={busy || undefined}
      disabled={busy}
      onClick={onClick}
    >
      <img src={verifyWithSingpass} alt="" width="174" height="40" />
    </button>
  )
}
