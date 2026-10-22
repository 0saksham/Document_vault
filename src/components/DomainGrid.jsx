import React, { useState, useEffect, useRef, useMemo } from 'react'
import { motion } from 'framer-motion'
import { getDomainIcon, LockIcon, ShieldIcon, StarIcon, ChevronRightIcon, PlusCircleIcon, ClockIcon } from './Icons'
import { getAllDocuments, isFavorite, getExpiryStatus, getLastActivity } from '../lib/vault'
import { createRipple, useIntersectionOnce } from '../lib/interactive'

const INACTIVITY_LOCK_MS = 5 * 60 * 1000

// Domain color metadata
export const DOMAIN_CONFIG = {
  identity: {
    accent: '#06b6d4',
    accentLight: '#38bdf8',
    glow: 'rgba(6, 182, 212, 0.28)',
    grad: 'linear-gradient(135deg, #0284c7 0%, #06b6d4 100%)',
    bgTint: 'rgba(6, 182, 212, 0.08)',
    borderTint: 'rgba(6, 182, 212, 0.35)',
    className: 'bento-card-identity',
  },
  school: {
    accent: '#f59e0b',
    accentLight: '#fbbf24',
    glow: 'rgba(245, 158, 11, 0.28)',
    grad: 'linear-gradient(135deg, #d97706 0%, #f59e0b 100%)',
    bgTint: 'rgba(245, 158, 11, 0.08)',
    borderTint: 'rgba(245, 158, 11, 0.35)',
    className: 'bento-card-school',
  },
  college: {
    accent: '#6366f1',
    accentLight: '#818cf8',
    glow: 'rgba(99, 102, 241, 0.28)',
    grad: 'linear-gradient(135deg, #4f46e5 0%, #0d9488 100%)',
    bgTint: 'rgba(99, 102, 241, 0.08)',
    borderTint: 'rgba(99, 102, 241, 0.35)',
    className: 'bento-card-college',
  },
  vehicle: {
    accent: '#f97316',
    accentLight: '#fb923c',
    glow: 'rgba(249, 115, 22, 0.28)',
    grad: 'linear-gradient(135deg, #ea580c 0%, #f97316 100%)',
    bgTint: 'rgba(249, 115, 22, 0.08)',
    borderTint: 'rgba(249, 115, 22, 0.35)',
    className: 'bento-card-vehicle',
  },
  banking: {
    accent: '#10b981',
    accentLight: '#34d399',
    glow: 'rgba(16, 185, 129, 0.28)',
    grad: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
    bgTint: 'rgba(16, 185, 129, 0.08)',
    borderTint: 'rgba(16, 185, 129, 0.35)',
    className: 'bento-card-banking',
  },
  health: {
    accent: '#f43f5e',
    accentLight: '#fb7185',
    glow: 'rgba(244, 63, 94, 0.28)',
    grad: 'linear-gradient(135deg, #e11d48 0%, #f43f5e 100%)',
    bgTint: 'rgba(244, 63, 94, 0.08)',
    borderTint: 'rgba(244, 63, 94, 0.35)',
    className: 'bento-card-health',
  },
  personal: {
    accent: '#ec4899',
    accentLight: '#f472b6',
    glow: 'rgba(236, 72, 153, 0.28)',
    grad: 'linear-gradient(135deg, #db2777 0%, #8b5cf6 100%)',
    bgTint: 'rgba(236, 72, 153, 0.08)',
    borderTint: 'rgba(236, 72, 153, 0.35)',
    className: 'bento-card-personal',
  },
}

// Animated count-up component with viewport trigger
function CountUp({ end, duration = 800, start = true }) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!start) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setCount(end)
      return
    }

    let startTime = null
    let frameId = null

    const step = (timestamp) => {
      if (!startTime) startTime = timestamp
      const progress = Math.min((timestamp - startTime) / duration, 1)
      setCount(Math.floor(progress * end))
      if (progress < 1) {
        frameId = requestAnimationFrame(step)
      } else {
        setCount(end)
      }
    }

    frameId = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frameId)
  }, [end, duration, start])

  return <span>{count}</span>
}

// Individual Bento Card
function BentoDomainCard({ domain, index, onClick }) {
  const cardRef = useRef(null)
  const isVisible = useIntersectionOnce(cardRef, 0.1)
  const [isTouchLifted, setIsTouchLifted] = useState(false)
  const cfg = DOMAIN_CONFIG[domain.id] || DOMAIN_CONFIG.identity

  const totalDocs = domain.documents.length
  const emptyCount = domain.documents.filter((d) => d.status === 'empty').length
  const availableCount = totalDocs - emptyCount
  const percent = totalDocs > 0 ? Math.round((availableCount / totalDocs) * 100) : 0

  // Document chips (top 3 document clean names / titles)
  const docChips = useMemo(() => {
    const list = domain.documents.map((d) => d.title.replace(/\s*(card|certificate|proof)\s*$/i, ''))
    return {
      shown: list.slice(0, 3),
      extra: list.length > 3 ? list.length - 3 : 0,
    }
  }, [domain.documents])

  // 3D Tilt and spotlight glow
  const handleMouseMove = (e) => {
    const card = cardRef.current
    if (!card || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const rect = card.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width - 0.5
    const y = (e.clientY - rect.top) / rect.height - 0.5
    card.style.transform = `perspective(800px) rotateY(${x * 10}deg) rotateX(${-y * 10}deg) translateZ(8px)`

    const spotlight = card.querySelector('.bento-spotlight')
    if (spotlight) {
      spotlight.style.background = `radial-gradient(circle at ${(x + 0.5) * 100}% ${(y + 0.5) * 100}%, ${cfg.glow} 0%, transparent 60%)`
      spotlight.style.opacity = '1'
    }
  }

  const handleMouseLeave = () => {
    const card = cardRef.current
    if (!card) return
    card.style.transform = ''
    const spotlight = card.querySelector('.bento-spotlight')
    if (spotlight) {
      spotlight.style.opacity = '0'
    }
  }

  const isFeatured = domain.id === 'identity'

  return (
    <motion.div
      ref={cardRef}
      className={`glass bento-card ${cfg.className} ${isFeatured ? 'bento-featured' : ''} ${isTouchLifted ? 'touch-lifted' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={`${domain.title} (${domain.titleHindi}) — ${availableCount} of ${totalDocs} documents added`}
      onClick={(e) => {
        createRipple(e)
        onClick()
      }}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onClick()}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onTouchStart={() => setIsTouchLifted(true)}
      onTouchEnd={() => setIsTouchLifted(false)}
      onTouchCancel={() => setIsTouchLifted(false)}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: index * 0.06, ease: [0.34, 1.56, 0.64, 1] }}
      whileTap={{ scale: 0.98 }}
      style={{
        '--card-accent': cfg.accent,
        '--card-accent-light': cfg.accentLight,
        '--card-glow': cfg.glow,
        '--card-grad': cfg.grad,
      }}
    >
      {/* Dynamic Cursor Spotlight Glow */}
      <div className="bento-spotlight" aria-hidden />

      {/* Top row: Icon + Progress Indicator */}
      <div className="bento-card-top">
        <div className="bento-icon-wrap" aria-hidden>
          {getDomainIcon(domain.id, { size: isFeatured ? 30 : 26 })}
        </div>

        {/* Circular Progress Ring animated when visible */}
        <div className="bento-progress-badge" title={`${availableCount} of ${totalDocs} added (${percent}%)`}>
          <svg width="38" height="38" viewBox="0 0 38 38" className="bento-ring-svg" aria-hidden>
            <circle cx="19" cy="19" r="15" className="bento-ring-bg" strokeWidth="3" />
            <circle
              cx="19"
              cy="19"
              r="15"
              className="bento-ring-val"
              strokeWidth="3.2"
              strokeDasharray="94.2"
              strokeDashoffset={isVisible ? 94.2 - (94.2 * percent) / 100 : 94.2}
              transform="rotate(-90 19 19)"
              style={{ transition: 'stroke-dashoffset 0.85s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
            />
          </svg>
          <span className="bento-ring-text">
            {isVisible ? <CountUp end={percent} duration={800} start={isVisible} /> : 0}%
          </span>
        </div>
      </div>

      {/* Middle row: Titles */}
      <div className="bento-card-body">
        <h3 className="bento-title">{domain.title}</h3>
        <p className="bento-title-hindi">{domain.titleHindi}</p>
      </div>

      {/* Document Chips Stack */}
      <div className="bento-chips-stack" aria-label="Documents in category">
        {docChips.shown.map((chip, i) => (
          <span key={i} className="bento-chip">
            {chip}
          </span>
        ))}
        {docChips.extra > 0 && <span className="bento-chip bento-chip-more">+{docChips.extra}</span>}
      </div>

      {/* Bottom row: Document count status & Chevron */}
      <div className="bento-card-footer">
        <div className="bento-count-status">
          <span className="bento-count-num">
            {availableCount} / {totalDocs} docs
          </span>
          {emptyCount > 0 && (
            <span className="bento-empty-pill" title={`${emptyCount} placeholder documents waiting to be added`}>
              {emptyCount} empty
            </span>
          )}
        </div>
        <div className="bento-chevron" aria-hidden>
          <ChevronRightIcon size={18} />
        </div>
      </div>
    </motion.div>
  )
}

export default function DomainGrid({ manifest, onDomainClick, onQuickDocClick, onLock }) {
  const [timeRemaining, setTimeRemaining] = useState('05:00')

  // Live auto-lock countdown timer (updated every second)
  useEffect(() => {
    const updateCountdown = () => {
      const elapsed = Date.now() - getLastActivity()
      const remainingMs = Math.max(0, INACTIVITY_LOCK_MS - elapsed)
      const minutes = Math.floor(remainingMs / 60000)
      const seconds = Math.floor((remainingMs % 60000) / 1000)
      setTimeRemaining(`${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`)
    }

    updateCountdown()
    const timer = setInterval(updateCountdown, 1000)
    return () => clearInterval(timer)
  }, [])

  if (!manifest) return null

  // Compute time-based greeting
  const greeting = useMemo(() => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 17) return 'Good afternoon'
    return 'Good evening'
  }, [])

  // Calculate real manifest metrics (no invented data)
  const { totalAvailable, totalEmpty, expiringCount } = useMemo(() => {
    let available = 0
    let empty = 0
    let expiring = 0

    for (const d of manifest.domains) {
      for (const doc of d.documents) {
        if (doc.status === 'empty') {
          empty++
        } else {
          available++
        }
        const exp = getExpiryStatus(doc)
        if (exp && (exp.status === 'warning' || exp.status === 'expired')) {
          expiring++
        }
      }
    }
    return { totalAvailable: available, totalEmpty: empty, expiringCount: expiring }
  }, [manifest])

  // Pinned / favorite documents for Quick Access row
  const pinnedDocs = useMemo(() => {
    const all = getAllDocuments()
    return all.filter((d) => isFavorite(d.id))
  }, [])

  // Place Identity Proof first as the featured 2-column bento card
  const bentoDomains = useMemo(() => {
    const list = [...manifest.domains]
    const idIdx = list.findIndex((d) => d.id === 'identity')
    if (idIdx > 0) {
      const [identity] = list.splice(idIdx, 1)
      list.unshift(identity)
    }
    return list
  }, [manifest.domains])

  const summaryRef = useRef(null)
  const summaryVisible = useIntersectionOnce(summaryRef, 0.2)

  return (
    <main className="domain-screen" id="main-content" aria-label="Vault Dashboard">
      {/* 1. Hero Header */}
      <section className="dashboard-hero">
        <div className="hero-greeting-pill">
          <span className="hero-dot" aria-hidden />
          <span>{greeting} · Vault Active</span>
        </div>

        <h1 className="hero-title">
          Digital Documents <span className="gradient-text">Vault</span>
        </h1>
        <p className="hero-subtitle">
          Your life's paperwork, organized and secure.
          <span className="hero-subtitle-hindi">आपके सारे दस्तावेज़, एक सुरक्षित जगह।</span>
        </p>
      </section>

      {/* 2. Summary Strip (computed from manifest only, animated into view) */}
      <section className="summary-strip" ref={summaryRef} aria-label="Vault Summary">
        <div className="glass summary-tile">
          <div className="summary-tile-icon icon-available">
            <ShieldIcon size={22} />
          </div>
          <div className="summary-tile-content">
            <div className="summary-tile-num">
              <CountUp end={totalAvailable} start={summaryVisible} />
            </div>
            <div className="summary-tile-label">Documents Added</div>
          </div>
        </div>

        <div className="glass summary-tile">
          <div className="summary-tile-icon icon-empty">
            <PlusCircleIcon size={22} />
          </div>
          <div className="summary-tile-content">
            <div className="summary-tile-num">
              <CountUp end={totalEmpty} start={summaryVisible} />
            </div>
            <div className="summary-tile-label">Placeholders Waiting</div>
          </div>
        </div>

        {/* Hide expiring tile if count is 0 / no expiry data */}
        {expiringCount > 0 && (
          <div className="glass summary-tile summary-tile-warning">
            <div className="summary-tile-icon icon-expiring">
              <ClockIcon size={22} />
            </div>
            <div className="summary-tile-content">
              <div className="summary-tile-num text-warning">
                <CountUp end={expiringCount} start={summaryVisible} />
              </div>
              <div className="summary-tile-label">Expiring Soon</div>
            </div>
          </div>
        )}
      </section>

      {/* 3. Quick Access (Pinned Documents) */}
      <section className="quick-access-section" aria-label="Quick Access Pinned Documents">
        <div className="section-header-row">
          <h2 className="section-title">
            <StarIcon size={18} className="section-title-icon" filled />
            <span>Quick Access</span>
          </h2>
        </div>

        {pinnedDocs.length > 0 ? (
          <div className="quick-access-row" role="list">
            {pinnedDocs.map((doc) => (
              <div
                key={doc.id}
                className="glass quick-doc-card"
                role="listitem"
                tabIndex={0}
                onClick={(e) => {
                  createRipple(e)
                  onQuickDocClick && onQuickDocClick(doc)
                }}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onQuickDocClick && onQuickDocClick(doc)}
                aria-label={`Open ${doc.title} (${doc.domainTitle})`}
              >
                <div className="quick-doc-icon" aria-hidden>
                  {getDomainIcon(doc.domainId, { size: 18 })}
                </div>
                <div className="quick-doc-info">
                  <div className="quick-doc-title">{doc.title}</div>
                  <div className="quick-doc-domain">{doc.domainTitle}</div>
                </div>
                <ChevronRightIcon size={16} className="quick-doc-arrow" />
              </div>
            ))}
          </div>
        ) : (
          <div className="quick-access-empty-hint glass">
            <StarIcon size={16} className="hint-star" />
            <span>Star any frequently used document in a category to pin it here for one-click access.</span>
          </div>
        )}
      </section>

      {/* 4. Bento Grid (7 categories arranged with Identity Proof as featured 2-column card) */}
      <section className="bento-section" aria-label="Life Categories">
        <div className="section-header-row">
          <h2 className="section-title">
            <span>Life Domains</span>
            <span className="section-subtitle-tag">7 Categories</span>
          </h2>
        </div>

        <div className="domain-bento-grid" role="list">
          {bentoDomains.map((domain, i) => (
            <BentoDomainCard
              key={domain.id}
              domain={domain}
              index={i}
              onClick={() => onDomainClick(domain)}
            />
          ))}
        </div>
      </section>

      {/* 5. Footer Strip with real countdown auto-lock status */}
      <footer className="dashboard-footer-strip glass">
        <div className="footer-lock-status">
          <span className="status-live-dot" aria-hidden />
          <span>Vault unlocked · Auto-lock in <strong>{timeRemaining}</strong></span>
        </div>
        {onLock && (
          <button className="footer-lock-btn" onClick={onLock} aria-label="Lock vault now">
            <LockIcon size={14} />
            <span>Lock Now</span>
          </button>
        )}
      </footer>
    </main>
  )
}
