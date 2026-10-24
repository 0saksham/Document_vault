import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ExpiryBadge from './ExpiryBadge'
import {
  getDomainIcon,
  getDocumentIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  StarIcon,
  CopyIcon,
  CheckIcon,
  EyeIcon,
  EyeOffIcon,
  PlusCircleIcon,
} from './Icons'
import { DOMAIN_CONFIG } from './DomainGrid'
import { getExpiryStatus, isFavorite, toggleFavorite, getPassword } from '../lib/vault'
import { fetchAndDecryptRaw } from '../lib/crypto'
import { buildZip } from '../lib/zip'
import { createRipple, useMagnetic, scheduleClipboardClear } from '../lib/interactive'
import { playPopSound, triggerHaptic } from '../lib/feedback'

// Text Value Card (Vehicle Number, Blood Group, Account Number)
function TextValueCard({ doc, domainCfg, addToast }) {
  const [revealed, setRevealed] = useState(!doc.masked)
  const [copied, setCopied] = useState(false)
  const [fav, setFav] = useState(isFavorite(doc.id))
  const [countdown, setCountdown] = useState(10)
  const timerRef = useRef(null)

  const value = doc.textValue || ''
  const displayValue = doc.masked && !revealed ? '•••• •••• •••• ' + value.slice(-4) : value

  // 10-second auto-mask countdown when revealed
  useEffect(() => {
    if (!doc.masked) return
    if (revealed) {
      setCountdown(10)
      clearInterval(timerRef.current)
      timerRef.current = setInterval(() => {
        setCountdown((c) => {
          if (c <= 1) {
            clearInterval(timerRef.current)
            setRevealed(false)
            return 10
          }
          return c - 1
        })
      }, 1000)
    } else {
      clearInterval(timerRef.current)
    }

    return () => clearInterval(timerRef.current)
  }, [revealed, doc.masked])

  const handleCopy = async (e) => {
    createRipple(e)
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      addToast('Copied to clipboard (auto-clears in 30s)', '📋')
      scheduleClipboardClear(30, () => {
        addToast('Clipboard auto-cleared for privacy', '🔒')
      })
      setTimeout(() => setCopied(false), 2200)
    } catch {
      addToast('Copy failed — try manually', '⚠️')
    }
  }

  const handleFav = (e) => {
    e.stopPropagation()
    playPopSound()
    triggerHaptic(20)
    toggleFavorite(doc.id)
    setFav(isFavorite(doc.id))
  }

  const handleToggleReveal = (e) => {
    createRipple(e)
    setRevealed((r) => !r)
  }

  // Circular ring countdown progress
  const countdownDashoffset = 44 - (44 * countdown) / 10

  return (
    <motion.div
      className="glass text-val-card"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      style={{
        '--card-accent': domainCfg.accent,
        '--card-glow': domainCfg.glow,
      }}
    >
      <div className="card-left-bar" aria-hidden />

      <div className="text-val-main">
        <div className="text-val-header">
          <div className="text-val-type-icon" aria-hidden>
            {getDocumentIcon(doc, { size: 18 })}
          </div>
          <span className="text-val-label">{doc.title}</span>
          {doc.masked && (
            <span className="text-val-masked-pill" title="Protected sensitive value">
              {revealed ? `Re-masking in ${countdown}s` : 'Masked Value'}
            </span>
          )}
        </div>

        <div className="text-val-body">
          <div
            className={`text-val-value ${doc.masked && !revealed ? 'is-masked' : ''}`}
            aria-label={doc.masked && !revealed ? 'Protected Value' : value}
          >
            {displayValue}
          </div>

          <div className="text-val-actions">
            {doc.masked && (
              <button
                className={`action-pill-btn reveal-btn ${revealed ? 'active' : ''}`}
                onClick={handleToggleReveal}
                aria-label={revealed ? `Hide sensitive value (${countdown}s left)` : 'Reveal sensitive value'}
                title={revealed ? `Hiding in ${countdown}s` : 'Reveal value (auto-masks in 10s)'}
                id={`reveal-${doc.id}`}
              >
                {revealed ? (
                  <>
                    <svg className="reveal-countdown-ring" width="16" height="16" viewBox="0 0 16 16" aria-hidden>
                      <circle cx="8" cy="8" r="7" className="ring-bg" strokeWidth="1.8" fill="none" />
                      <circle
                        cx="8"
                        cy="8"
                        r="7"
                        className="ring-val"
                        strokeWidth="1.8"
                        strokeDasharray="44"
                        strokeDashoffset={countdownDashoffset}
                        fill="none"
                        transform="rotate(-90 8 8)"
                      />
                    </svg>
                    <span>{countdown}s</span>
                  </>
                ) : (
                  <>
                    <EyeIcon size={14} />
                    <span>Reveal</span>
                  </>
                )}
              </button>
            )}

            <button
              className={`action-pill-btn copy-btn ${copied ? 'copied' : ''}`}
              onClick={handleCopy}
              aria-label={`Copy ${doc.title}`}
              title="Copy value to clipboard"
            >
              <span className={`copy-icon-morph ${copied ? 'morph-check' : ''}`}>
                {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
              </span>
              <span>{copied ? 'Copied!' : 'Copy'}</span>
            </button>

            <button
              className={`fav-btn-icon ${fav ? 'active star-popping' : ''}`}
              onClick={handleFav}
              aria-label={fav ? 'Unpin' : 'Pin to Quick Access'}
              title={fav ? 'Remove from Quick Access' : 'Pin to Quick Access'}
            >
              <StarIcon size={16} filled={fav} />
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

// Rich Document Card (PDFs, Images, and Empty Placeholders) with touch swipe actions
function DocCard({ doc, index, domainCfg, onClick, addToast }) {
  const [fav, setFav] = useState(isFavorite(doc.id))
  const [swipeOffset, setSwipeOffset] = useState(0)
  const touchStartX = useRef(null)
  const expiry = getExpiryStatus(doc)
  const isEmpty = doc.status === 'empty'

  const handleFav = (e) => {
    e.stopPropagation()
    playPopSound()
    triggerHaptic(20)
    toggleFavorite(doc.id)
    setFav(isFavorite(doc.id))
  }

  // Mobile swipe-left handlers to reveal quick actions
  const handleTouchStart = (e) => {
    if (isEmpty) return
    touchStartX.current = e.touches[0].clientX
  }

  const handleTouchMove = (e) => {
    if (touchStartX.current == null || isEmpty) return
    const diff = e.touches[0].clientX - touchStartX.current
    if (diff < -15) {
      // Swiping left
      setSwipeOffset(Math.max(-100, diff))
    } else if (diff > 20) {
      setSwipeOffset(0)
    }
  }

  const handleTouchEnd = () => {
    if (swipeOffset < -45) {
      setSwipeOffset(-95) // keep quick actions open
    } else {
      setSwipeOffset(0)
    }
    touchStartX.current = null
  }

  // Format file size
  const formatSize = (bytes) => {
    if (!bytes) return null
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / 1024).toFixed(0)} KB`
  }

  const fileTypeLabel = doc.mimeType?.includes('pdf')
    ? 'PDF Document'
    : doc.mimeType?.includes('image')
    ? 'Digital Image'
    : 'Document'

  return (
    <div className="doc-card-container">
      {/* Mobile Swipe Quick Actions Revealed Underneath */}
      {!isEmpty && (
        <div className="doc-swipe-actions" aria-hidden>
          <button
            className={`swipe-action-btn swipe-fav-btn ${fav ? 'active' : ''}`}
            onClick={handleFav}
            aria-label="Pin document"
          >
            <StarIcon size={16} filled={fav} />
          </button>
          <button
            className="swipe-action-btn swipe-open-btn"
            onClick={(e) => {
              setSwipeOffset(0)
              onClick()
            }}
            aria-label="Open document"
          >
            <ChevronRightIcon size={18} />
          </button>
        </div>
      )}

      <motion.div
        className={`glass doc-card ${isEmpty ? 'doc-card-empty' : ''}`}
        role={isEmpty ? 'listitem' : 'button'}
        tabIndex={isEmpty ? -1 : 0}
        aria-label={`${doc.title}${isEmpty ? ' — not added yet. Add the file to data/ and re-run encrypt' : ''}`}
        title={isEmpty ? 'Add the file to data/ and re-run encrypt' : undefined}
        onClick={
          isEmpty
            ? undefined
            : (e) => {
                if (swipeOffset !== 0) {
                  setSwipeOffset(0)
                  return
                }
                createRipple(e)
                onClick()
              }
        }
        onKeyDown={isEmpty ? undefined : (e) => (e.key === 'Enter' || e.key === ' ') && onClick()}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: index * 0.04, ease: [0.34, 1.56, 0.64, 1] }}
        style={{
          '--card-accent': domainCfg.accent,
          '--card-glow': domainCfg.glow,
          transform: swipeOffset !== 0 ? `translateX(${swipeOffset}px)` : undefined,
          transition: touchStartX.current == null ? 'transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)' : 'none',
        }}
      >
        {/* Thin left accent bar */}
        <div className="card-left-bar" aria-hidden />

        {/* Document Icon */}
        <div className="doc-file-icon" aria-hidden>
          {getDocumentIcon(doc, { size: 22 })}
        </div>

        {/* Document Information */}
        <div className="doc-info">
          <div className="doc-title-row">
            <span className="doc-title">{doc.title}</span>
            {expiry && <ExpiryBadge status={expiry} />}
          </div>

          <div className="doc-meta">
            {isEmpty ? (
              <span className="doc-meta-empty">Placeholder ready · Add file to data/ anytime</span>
            ) : (
              <>
                <span className="doc-format-pill">{fileTypeLabel}</span>
                {doc.sizeBytes && (
                  <span className="doc-size-text">· {formatSize(doc.sizeBytes)}</span>
                )}
                {doc.note && (
                  <span className="doc-note-text" title={doc.note}>· {doc.note}</span>
                )}
              </>
            )}
          </div>
        </div>

        {/* Actions and Chevron */}
        <div className="doc-card-actions">
          {isEmpty ? (
            <div className="add-later-chip" title="Add the file to data/ and re-run encrypt">
              <PlusCircleIcon size={14} />
              <span>Add later</span>
            </div>
          ) : (
            <>
              <button
                className={`fav-btn-icon ${fav ? 'active star-popping' : ''}`}
                onClick={handleFav}
                aria-label={fav ? 'Unpin' : 'Pin to Quick Access'}
                title={fav ? 'Remove from Quick Access' : 'Pin to Quick Access'}
              >
                <StarIcon size={17} filled={fav} />
              </button>
              <div className="doc-card-chevron" aria-hidden>
                <ChevronRightIcon size={18} />
              </div>
            </>
          )}
        </div>
      </motion.div>
    </div>
  )
}

export default function DocumentList({ domain, onBack, onDocClick, addToast }) {
  const [zipping, setZipping] = useState(false)
  const zipBtnRef = useRef(null)
  const cfg = DOMAIN_CONFIG[domain.id] || DOMAIN_CONFIG.identity

  // Magnetic attraction on Download ZIP button
  useMagnetic(zipBtnRef, 0.22)

  const fileDocs = domain.documents.filter((d) => d.type !== 'text' && d.status === 'available')
  const textDocs = domain.documents.filter((d) => d.type === 'text')
  const emptyDocs = domain.documents.filter((d) => d.type !== 'text' && d.status === 'empty')

  const totalCount = domain.documents.length
  const addedCount = totalCount - emptyDocs.length
  const percent = totalCount > 0 ? Math.round((addedCount / totalCount) * 100) : 0

  const handleDownloadZip = async (e) => {
    if (zipping || fileDocs.length === 0) return
    createRipple(e)
    setZipping(true)
    try {
      const password = getPassword()
      const files = []
      for (const doc of fileDocs) {
        const buf = await fetchAndDecryptRaw(doc.fileId, password)
        const ext = doc.mimeType?.includes('pdf')
          ? '.pdf'
          : doc.mimeType?.includes('png')
          ? '.png'
          : doc.mimeType?.includes('jpeg')
          ? '.jpg'
          : doc.mimeType?.includes('webp')
          ? '.webp'
          : ''
        files.push({ name: `${doc.cleanName || doc.title}${ext}`, data: buf })
      }
      const zipBuf = buildZip(files)
      const blob = new Blob([zipBuf], { type: 'application/zip' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${domain.title}-documents.zip`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 10000)
      addToast(`Downloaded ${files.length} files as ZIP`, '📦')
    } catch {
      addToast('ZIP download failed', '⚠️')
    } finally {
      setZipping(false)
    }
  }

  return (
    <main
      className="doc-list-screen"
      aria-label={`${domain.title} documents`}
      style={{
        '--domain-accent': cfg.accent,
        '--domain-accent-light': cfg.accentLight,
        '--domain-glow': cfg.glow,
        '--domain-grad': cfg.grad,
      }}
    >
      {/* 1. Sticky Glass Top Breadcrumb */}
      <nav className="doc-screen-nav glass" aria-label="Navigation">
        <button
          className="back-nav-btn"
          onClick={(e) => {
            createRipple(e)
            onBack()
          }}
          aria-label="Go back to categories"
        >
          <ChevronLeftIcon size={18} />
          <span>Categories</span>
        </button>
        <span className="nav-breadcrumb-sep" aria-hidden>
          /
        </span>
        <span className="nav-breadcrumb-curr" aria-current="page">
          {domain.title}
        </span>
      </nav>

      {/* 2. Rich Domain Header Banner */}
      <section className="domain-banner glass" style={{ borderColor: cfg.borderTint }}>
        <div className="domain-banner-glow" style={{ background: cfg.glow }} aria-hidden />

        <div className="domain-banner-content">
          <div className="domain-banner-icon-wrap" style={{ background: cfg.grad }}>
            {getDomainIcon(domain.id, { size: 32 })}
          </div>

          <div className="domain-banner-titles">
            <h1 className="domain-banner-title">{domain.title}</h1>
            <p className="domain-banner-hindi">{domain.titleHindi}</p>

            {/* Added / Total progress pill */}
            <div className="domain-banner-progress-row">
              <span className="domain-progress-text">
                <strong>{addedCount}</strong> of <strong>{totalCount}</strong> documents ready
              </span>
              <div className="domain-progress-bar-track" aria-hidden>
                <div
                  className="domain-progress-bar-fill"
                  style={{ width: `${percent}%`, background: cfg.grad }}
                />
              </div>
            </div>
          </div>

          {/* Download ZIP button with magnetic pull */}
          {fileDocs.length > 0 && (
            <div className="domain-banner-actions">
              <button
                ref={zipBtnRef}
                className="banner-zip-btn"
                onClick={handleDownloadZip}
                disabled={zipping}
                aria-label={`Download all ${fileDocs.length} ${domain.title} files as ZIP`}
                id={`zip-${domain.id}`}
              >
                <DownloadIcon size={16} />
                <span>{zipping ? 'Zipping…' : 'Download ZIP'}</span>
              </button>
            </div>
          )}
        </div>
      </section>

      {/* 3. Text Value Cards (Vehicle Number, Blood Group, Account Number) */}
      {textDocs.length > 0 && (
        <section className="text-val-section" aria-label="Information values">
          <div className="section-label">Verified Personal Data</div>
          <div className="text-val-grid">
            {textDocs.map((doc) => (
              <TextValueCard key={doc.id} doc={doc} domainCfg={cfg} addToast={addToast} />
            ))}
          </div>
        </section>
      )}

      {/* 4. Document File Cards */}
      <section className="doc-list-section" aria-label="Document Files">
        <div className="section-label">Files & Documents</div>
        <div className="doc-cards-stack" role="list">
          {domain.documents
            .filter((d) => d.type !== 'text')
            .map((doc, i) => (
              <DocCard
                key={doc.id}
                doc={doc}
                index={i}
                domainCfg={cfg}
                addToast={addToast}
                onClick={() => {
                  onDocClick(doc, fileDocs)
                }}
              />
            ))}
        </div>
      </section>
    </main>
  )
}
