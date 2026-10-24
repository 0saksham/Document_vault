import React, { useState, useRef, useEffect, useMemo } from 'react'
import { getAllDocuments, getLastActivity, touchActivity } from '../lib/vault'
import {
  SearchIcon,
  SunIcon,
  MoonIcon,
  LockIcon,
  getDomainIcon,
  getDocumentIcon,
  CloseIcon,
  VolumeIcon,
  VolumeMuteIcon,
  VibrateIcon,
  CommandIcon,
} from './Icons'
import {
  isSoundEnabled,
  setSoundEnabled,
  isVibrationEnabled,
  setVibrationEnabled,
  playClickSound,
  triggerHaptic,
} from '../lib/feedback'
import { createRipple, useMagnetic } from '../lib/interactive'

const INACTIVITY_LOCK_MS = 5 * 60 * 1000 // 5 minutes

function HighlightMatch({ text = '', query = '' }) {
  if (!query.trim()) return <span>{text}</span>
  const q = query.toLowerCase()
  const idx = text.toLowerCase().indexOf(q)
  if (idx === -1) return <span>{text}</span>

  const before = text.slice(0, idx)
  const match = text.slice(idx, idx + q.length)
  const after = text.slice(idx + q.length)

  return (
    <span>
      {before}
      <mark className="search-highlight">{match}</mark>
      {after}
    </span>
  )
}

export default function TopBar({
  onLock,
  theme,
  setTheme,
  manifest,
  onSearchNavigate,
  searchQuery,
  setSearchQuery,
  onOpenCmd,
  addToast,
}) {
  const [results, setResults] = useState([])
  const [focused, setFocused] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [remainingSecs, setRemainingSecs] = useState(300)
  const [soundOn, setSoundOn] = useState(isSoundEnabled())
  const [vibeOn, setVibeOn] = useState(isVibrationEnabled())
  const hasWarned10s = useRef(false)

  const inputRef = useRef(null)
  const containerRef = useRef(null)
  const lockBtnRef = useRef(null)

  // Magnetic attraction on Lock button
  useMagnetic(lockBtnRef, 0.2)

  // Auto-lock countdown ring & 10s toast notification
  useEffect(() => {
    const timer = setInterval(() => {
      const elapsed = Date.now() - getLastActivity()
      const leftMs = Math.max(0, INACTIVITY_LOCK_MS - elapsed)
      const leftSecs = Math.ceil(leftMs / 1000)
      setRemainingSecs(leftSecs)

      if (leftSecs <= 10 && !hasWarned10s.current) {
        hasWarned10s.current = true
        addToast?.('Locking in 10s — tap or move to stay unlocked', '⏱', 4000)
      } else if (leftSecs > 10) {
        hasWarned10s.current = false
      }
    }, 1000)

    return () => clearInterval(timer)
  }, [addToast])

  // Live search filtering
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setResults([])
      setSelectedIndex(0)
      return
    }
    const q = searchQuery.toLowerCase()
    const docs = getAllDocuments()
    const matched = docs
      .filter(
        (d) =>
          d.title.toLowerCase().includes(q) ||
          d.domainTitle?.toLowerCase().includes(q) ||
          (d.textValue && d.textValue.toLowerCase().includes(q)) ||
          (d.note && d.note.toLowerCase().includes(q))
      )
      .slice(0, 10)
    setResults(matched)
    setSelectedIndex(0)
  }, [searchQuery])

  // Group matched results by domain
  const groupedResults = useMemo(() => {
    const groups = {}
    results.forEach((doc) => {
      const dTitle = doc.domainTitle || 'Vault Documents'
      if (!groups[dTitle]) groups[dTitle] = []
      groups[dTitle].push(doc)
    })
    return groups
  }, [results])

  // Close search on outside click
  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setFocused(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleSelect = (doc) => {
    playClickSound()
    triggerHaptic(15)
    setSearchQuery('')
    setFocused(false)
    onSearchNavigate(doc)
  }

  // Keyboard navigation for search dropdown
  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((idx) => (idx + 1) % Math.max(1, results.length))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((idx) => (idx - 1 + results.length) % Math.max(1, results.length))
    } else if (e.key === 'Enter') {
      if (results[selectedIndex]) {
        e.preventDefault()
        handleSelect(results[selectedIndex])
      }
    } else if (e.key === 'Escape') {
      setSearchQuery('')
      setFocused(false)
    }
  }

  // Circular reveal theme toggle
  const handleToggleTheme = (e) => {
    playClickSound()
    triggerHaptic(15)
    createRipple(e)
    const next = theme === 'dark' ? 'light' : 'dark'

    if (
      typeof document !== 'undefined' &&
      document.startViewTransition &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      const rect = e.currentTarget.getBoundingClientRect()
      const x = rect.left + rect.width / 2
      const y = rect.top + rect.height / 2
      document.documentElement.style.setProperty('--theme-x', `${x}px`)
      document.documentElement.style.setProperty('--theme-y', `${y}px`)
      document.startViewTransition(() => setTheme(next))
    } else {
      setTheme(next)
    }
  }

  // Sound toggle
  const handleToggleSound = (e) => {
    createRipple(e)
    const next = !soundOn
    setSoundEnabled(next)
    setSoundOn(next)
    if (next) playClickSound()
    triggerHaptic(20)
    addToast?.(next ? 'Sound effects enabled' : 'Sound effects muted', next ? '🔊' : '🔇')
  }

  // Vibration toggle
  const handleToggleVibe = (e) => {
    createRipple(e)
    const next = !vibeOn
    setVibrationEnabled(next)
    setVibeOn(next)
    if (next) triggerHaptic([30, 40, 30])
    addToast?.(next ? 'Haptic feedback on' : 'Haptic feedback off', '📳')
  }

  // Ring status
  const ringState =
    remainingSecs <= 20 ? 'urgent-red' : remainingSecs <= 60 ? 'warning-amber' : 'neutral'
  const radius = 11
  const circumference = 2 * Math.PI * radius
  const ringProgress = Math.min(1, Math.max(0, remainingSecs / 300))
  const dashOffset = circumference * (1 - ringProgress)

  return (
    <header className="top-bar glass" role="banner">
      {/* Brand Logo */}
      <div className="top-bar-logo" role="heading" aria-level="2">
        <span className="brand-symbol" aria-hidden>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
              stroke="url(#topbar-grad)"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <defs>
              <linearGradient id="topbar-grad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#7c5cff" />
                <stop offset="100%" stopColor="#22d3ee" />
              </linearGradient>
            </defs>
          </svg>
        </span>
        <span className="brand-text">
          Digital <span className="gradient-text">Vault</span>
        </span>
      </div>

      {/* Global Search Bar */}
      <div ref={containerRef} className="search-container">
        <div className="search-bar">
          <span className="search-icon" aria-hidden>
            <SearchIcon size={16} />
          </span>
          <input
            ref={inputRef}
            className="search-input"
            type="search"
            placeholder="Search documents, IDs, records… (Press /)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onKeyDown={handleKeyDown}
            aria-label="Search documents"
            id="doc-search"
            autoComplete="off"
          />
          {searchQuery && (
            <button
              type="button"
              className="search-clear-btn"
              onClick={() => {
                setSearchQuery('')
                inputRef.current?.focus()
              }}
              aria-label="Clear search"
            >
              <CloseIcon size={14} />
            </button>
          )}
          <span className="search-slash-hint" aria-hidden>
            /
          </span>
        </div>

        {/* Grouped Search Results Dropdown with Highlighted Letters */}
        {focused && results.length > 0 && (
          <div className="search-results glass" role="listbox" aria-label="Search results">
            <div className="search-results-header">
              <span>Matching Documents ({results.length})</span>
              <span className="search-results-nav-tip">Use ↑ ↓ Enter</span>
            </div>

            {Object.entries(groupedResults).map(([domainGroup, docs]) => (
              <div key={domainGroup} className="search-domain-group">
                <div className="search-domain-header">{domainGroup}</div>
                {docs.map((doc) => {
                  const itemIndex = results.indexOf(doc)
                  const isSelected = itemIndex === selectedIndex
                  return (
                    <div
                      key={doc.id}
                      className={`search-result-item ${isSelected ? 'selected' : ''}`}
                      role="option"
                      aria-selected={isSelected}
                      tabIndex={0}
                      onClick={(e) => {
                        createRipple(e)
                        handleSelect(doc)
                      }}
                      onMouseEnter={() => setSelectedIndex(itemIndex)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSelect(doc)}
                    >
                      <div className="search-result-icon" aria-hidden>
                        {getDocumentIcon(doc, { size: 18 })}
                      </div>
                      <div className="search-result-details">
                        <div className="search-result-title">
                          <HighlightMatch text={doc.title} query={searchQuery} />
                        </div>
                        <div className="search-result-domain-row">
                          <span className="search-result-domain-tag">
                            {getDomainIcon(doc.domainId, { size: 12 })}
                            <span>
                              <HighlightMatch text={doc.domainTitle} query={searchQuery} />
                            </span>
                          </span>
                          {doc.sizeBytes && (
                            <span className="search-result-size">
                              · {(doc.sizeBytes / 1024).toFixed(0)} KB
                            </span>
                          )}
                        </div>
                      </div>
                      {doc.status === 'empty' && (
                        <span className="search-result-badge-empty">Empty</span>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="top-bar-spacer" />

      {/* Auto-lock countdown timer with reactive SVG ring */}
      <div
        className={`autolock-countdown-pill ${ringState}`}
        title={`Vault auto-locks after 5 min of inactivity. ${remainingSecs}s remaining. Move or tap to reset.`}
        onClick={() => {
          touchActivity()
          setRemainingSecs(300)
          addToast?.('Session timer extended', '⏱')
        }}
        role="timer"
        aria-live="polite"
      >
        <svg className="autolock-ring-svg" width="28" height="28" viewBox="0 0 28 28">
          <circle
            className="autolock-ring-bg"
            cx="14"
            cy="14"
            r={radius}
            strokeWidth="2.5"
            fill="none"
          />
          <circle
            className="autolock-ring-fill"
            cx="14"
            cy="14"
            r={radius}
            strokeWidth="2.5"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            fill="none"
            transform="rotate(-90 14 14)"
          />
        </svg>
        <span className="autolock-secs-text">{remainingSecs}s</span>
      </div>

      {/* Command Palette Button */}
      <button
        className="icon-action-btn cmd-palette-trigger-btn"
        onClick={(e) => {
          createRipple(e)
          onOpenCmd?.()
        }}
        aria-label="Open Command Palette (Ctrl+K)"
        title="Open Command Palette (Ctrl+K)"
      >
        <CommandIcon size={17} />
        <span className="kbd-shortcut-pill">⌘K</span>
      </button>

      {/* Sound Effects Toggle (OFF by default) */}
      <button
        className={`icon-action-btn sound-toggle-btn ${soundOn ? 'active' : ''}`}
        onClick={handleToggleSound}
        aria-label={soundOn ? 'Disable Sound Effects' : 'Enable Sound Effects (OFF by default)'}
        title={soundOn ? 'Sound: ON (Click to mute)' : 'Sound: OFF (Click to enable)'}
      >
        {soundOn ? <VolumeIcon size={18} /> : <VolumeMuteIcon size={18} />}
      </button>

      {/* Vibration Haptic Toggle (OFF by default) */}
      {typeof navigator !== 'undefined' && 'vibrate' in navigator && (
        <button
          className={`icon-action-btn vibe-toggle-btn ${vibeOn ? 'active' : ''}`}
          onClick={handleToggleVibe}
          aria-label={vibeOn ? 'Disable Vibration' : 'Enable Vibration (OFF by default)'}
          title={vibeOn ? 'Vibration: ON' : 'Vibration: OFF'}
        >
          <VibrateIcon size={18} />
        </button>
      )}

      {/* Theme Toggle (Dark / Light with circular reveal) */}
      <button
        className="icon-action-btn theme-toggle-btn"
        onClick={handleToggleTheme}
        aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      >
        {theme === 'dark' ? <SunIcon size={18} /> : <MoonIcon size={18} />}
      </button>

      {/* Magnetic Vault Lock Button */}
      <button
        ref={lockBtnRef}
        className="topbar-lock-btn magnetic-lock-btn"
        onClick={(e) => {
          createRipple(e)
          playClickSound()
          onLock()
        }}
        aria-label="Lock vault session immediately"
        id="lock-vault-btn"
      >
        <LockIcon size={14} />
        <span>Lock</span>
      </button>
    </header>
  )
}
