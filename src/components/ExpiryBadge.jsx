import React from 'react'
import { ClockIcon, CheckIcon } from './Icons'

/**
 * Format an ISO date string (YYYY-MM-DD) into readable Indian/international format: DD Mon YYYY
 */
export function formatExpiryDate(dateStr) {
  if (!dateStr) return ''
  try {
    const parts = String(dateStr).split('-')
    if (parts.length === 3) {
      const year = parts[0]
      const monthIdx = parseInt(parts[1], 10) - 1
      const day = parseInt(parts[2], 10)
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
      if (monthIdx >= 0 && monthIdx < 12 && !isNaN(day)) {
        return `${day} ${months[monthIdx]} ${year}`
      }
    }
    const d = new Date(dateStr)
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    }
    return String(dateStr)
  } catch {
    return String(dateStr)
  }
}

export default function ExpiryBadge({ status }) {
  if (!status) return null
  const { daysLeft, status: level, expiryDate } = status

  const formattedDate = formatExpiryDate(expiryDate)

  let label
  if (level === 'expired') {
    label = formattedDate ? `Expired (${formattedDate})` : 'Expired'
  } else if (daysLeft === 0) {
    label = 'Expires today'
  } else if (daysLeft === 1) {
    label = 'Expires tomorrow'
  } else if (daysLeft <= 30) {
    label = `Expires in ${daysLeft}d`
  } else {
    // For valid long-term expiry dates
    label = formattedDate ? `Valid till ${formattedDate}` : `Expires in ${daysLeft}d`
  }

  const tooltip = formattedDate
    ? `${label} · Full date: ${formattedDate} (${daysLeft > 0 ? `${daysLeft} days remaining` : 'Expired'})`
    : label

  return (
    <span
      className={`expiry-badge ${level}`}
      role="status"
      aria-label={label}
      title={tooltip}
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

