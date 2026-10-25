import Icon from './ui/Icon'

export const VERIFIED_BADGE_LABEL = 'ID verified'

export default function VerifiedBadge({ className = '' }) {
  return (
    <p className={['verified-badge', className].filter(Boolean).join(' ')}>
      <Icon name="shield" size={15} />
      {VERIFIED_BADGE_LABEL}
    </p>
  )
}
