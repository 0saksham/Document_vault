import React from 'react'
import { ClockIcon, CheckIcon } from './Icons'

export default function ExpiryBadge({ status }) {
  if (!status) return null
  const { daysLeft, status: level } = status

  let label
  if (level === 'expired') label = 'Expired'
  else if (daysLeft === 0) label = 'Expires today'
  else if (daysLeft === 1) label = 'Expires tomorrow'
  else label = `Expires in ${daysLeft}d`

  return (
    <span
      className={`expiry-badge ${level}`}
      role="status"
      aria-label={label}
      title={label}
    >
      {level === 'expired' ? (
        <span className="badge-dot dot-expired" aria-hidden />
      ) : level === 'warning' ? (
        <ClockIcon size={12} className="badge-icon-warning" />
      ) : (
        <CheckIcon size={12} className="badge-icon-ok" />
      )}
      <span>{label}</span>
    </span>
  )
}
