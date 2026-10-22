import React, { useState, useEffect, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  SearchIcon,
  CloseIcon,
  LockIcon,
  SunIcon,
  MoonIcon,
  VolumeIcon,
  VolumeMuteIcon,
  VibrateIcon,
  getDomainIcon,
  getDocumentIcon,
} from './Icons'
import { getAllDocuments } from '../lib/vault'
import {
  isSoundEnabled,
  setSoundEnabled,
  isVibrationEnabled,
  setVibrationEnabled,
  playClickSound,
  triggerHaptic,
} from '../lib/feedback'

// Helper to highlight matching letters in search text
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
      <mark className="cmd-highlight">{match}</mark>
      {after}
    </span>
  )
}

export default function CommandPalette({
  isOpen,
  onClose,
  manifest,
  onNavigateDomain,
  onNavigateDoc,
  onLock,
  theme,
  setTheme,
  addToast,
}) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [soundOn, setSoundOn] = useState(isSoundEnabled())
  const [vibeOn, setVibeOn] = useState(isVibrationEnabled())
  const inputRef = useRef(null)
  const listRef = useRef(null)

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setSelectedIndex(0)
      setSoundOn(isSoundEnabled())
      setVibeOn(isVibrationEnabled())
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  // Build command items: Actions + Domains + Documents
  const items = useMemo(() => {
    if (!manifest) return []
    const q = query.trim().toLowerCase()

    // 1. Actions
    const actionList = [
      {
        id: 'act-lock',
        type: 'action',
        title: 'Lock Vault',
        subtitle: 'End session and clear memory',
        icon: <LockIcon size={18} />,
        handler: () => {
          onClose()
          onLock()
        },
      },
      {
        id: 'act-theme',
        type: 'action',
        title: theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme',
        subtitle: 'Toggle dark & light appearance',
        icon: theme === 'dark' ? <SunIcon size={18} /> : <MoonIcon size={18} />,
        handler: () => {
          playClickSound()
          triggerHaptic(15)
          setTheme((t) => (t === 'dark' ? 'light' : 'dark'))
          addToast(theme === 'dark' ? 'Light mode enabled' : 'Dark mode enabled', '🌓')
          onClose()
        },
      },
      {
        id: 'act-sound',
        type: 'action',
        title: soundOn ? 'Disable Sound Effects' : 'Enable Sound Effects',
        subtitle: 'Synthesized Web Audio clicks & chimes',
        icon: soundOn ? <VolumeMuteIcon size={18} /> : <VolumeIcon size={18} />,
        handler: () => {
          const next = !soundOn
          setSoundEnabled(next)
          setSoundOn(next)
          if (next) playClickSound()
          triggerHaptic(20)
          addToast(next ? 'Sound effects enabled' : 'Sound muted', next ? '🔊' : '🔇')
          onClose()
        },
      },
      {
        id: 'act-vibe',
        type: 'action',
        title: vibeOn ? 'Disable Vibration' : 'Enable Vibration',
        subtitle: 'Haptic feedback on mobile devices',
        icon: <VibrateIcon size={18} />,
        handler: () => {
          const next = !vibeOn
          setVibrationEnabled(next)
          setVibeOn(next)
          if (next) triggerHaptic([30, 50, 30])
          addToast(next ? 'Haptic feedback on' : 'Haptic feedback off', '📳')
          onClose()
        },
      },
    ]

    // 2. Domains
    const domainList = manifest.domains.map((d) => ({
      id: `dom-${d.id}`,
      type: 'domain',
      title: `${d.title} (${d.titleHindi})`,
      subtitle: `${d.documents.length} documents`,
      domainId: d.id,
      icon: getDomainIcon(d.id, { size: 18 }),
      handler: () => {
        playClickSound()
        onClose()
        onNavigateDomain(d)
      },
    }))

    // 3. Documents
    const docList = getAllDocuments().map((doc) => ({
      id: `doc-${doc.id}`,
      type: 'document',
      title: doc.title,
      subtitle: `${doc.domainTitle}${doc.status === 'empty' ? ' · (Empty placeholder)' : ''}`,
      doc,
      icon: getDocumentIcon(doc, { size: 18 }),
      handler: () => {
        playClickSound()
        onClose()
        onNavigateDoc(doc)
      },
    }))

    const all = [...actionList, ...domainList, ...docList]

    if (!q) return all

    return all.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.subtitle.toLowerCase().includes(q) ||
        (item.doc?.textValue && item.doc.textValue.toLowerCase().includes(q))
    )
  }, [manifest, query, theme, soundOn, vibeOn, onClose, onLock, onNavigateDomain, onNavigateDoc, setTheme, addToast])

  // Keyboard navigation
  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, items.length))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev - 1 + items.length) % Math.max(1, items.length))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (items[selectedIndex]) {
        items[selectedIndex].handler()
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  // Auto-scroll selected item into view
  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const activeEl = list.children[selectedIndex]
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [selectedIndex])

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <div className="cmd-backdrop" onClick={onClose} aria-modal="true" role="dialog" aria-label="Command Palette">
        <motion.div
          className="cmd-dialog glass"
          onClick={(e) => e.stopPropagation()}
          initial={{ opacity: 0, scale: 0.95, y: -20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -20 }}
          transition={{ duration: 0.2, ease: [0.34, 1.56, 0.64, 1] }}
        >
          {/* Search Header */}
          <div className="cmd-search-row">
            <SearchIcon size={18} className="cmd-search-icon" />
            <input
              ref={inputRef}
              className="cmd-input"
              type="text"
              placeholder="Type a command or search documents… (Esc to close)"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setSelectedIndex(0)
              }}
              onKeyDown={handleKeyDown}
              autoComplete="off"
            />
            <button className="cmd-close-btn" onClick={onClose} aria-label="Close command palette">
              <CloseIcon size={16} />
            </button>
          </div>

          {/* Results List */}
          <div className="cmd-list" ref={listRef} role="listbox">
            {items.length > 0 ? (
              items.map((item, idx) => (
                <div
                  key={item.id}
                  className={`cmd-item ${idx === selectedIndex ? 'selected' : ''}`}
                  role="option"
                  aria-selected={idx === selectedIndex}
                  onClick={item.handler}
                  onMouseEnter={() => setSelectedIndex(idx)}
                >
                  <div className={`cmd-item-icon ${item.type}`}>{item.icon}</div>
                  <div className="cmd-item-content">
                    <div className="cmd-item-title">
                      <HighlightMatch text={item.title} query={query} />
                    </div>
                    <div className="cmd-item-subtitle">
                      <HighlightMatch text={item.subtitle} query={query} />
                    </div>
                  </div>
                  <div className="cmd-item-type-badge">{item.type}</div>
                </div>
              ))
            ) : (
              <div className="cmd-empty-msg">No matching commands or documents found</div>
            )}
          </div>

          {/* Footer Shortcuts */}
          <div className="cmd-footer">
            <span className="cmd-shortcut">
              <kbd>↑</kbd> <kbd>↓</kbd> Navigate
            </span>
            <span className="cmd-shortcut">
              <kbd>Enter</kbd> Select
            </span>
            <span className="cmd-shortcut">
              <kbd>Esc</kbd> Close
            </span>
            <span className="cmd-shortcut">
              <kbd>Ctrl+K</kbd> Toggle
            </span>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
