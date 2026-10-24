import React, { useState, useEffect, useCallback, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import ParallaxBackground from './components/ParallaxBackground'
import LockScreen from './components/LockScreen'
import TopBar from './components/TopBar'
import DomainGrid from './components/DomainGrid'
import DocumentList from './components/DocumentList'
import PreviewModal from './components/PreviewModal'
import CommandPalette from './components/CommandPalette'
import ToastContainer from './components/ToastContainer'
import {
  isUnlocked, lockVault, setVaultSession, getManifest,
  touchActivity, getLastActivity, getAllDocuments
} from './lib/vault'
import { decryptManifest } from './lib/crypto'

// Auto-lock timeouts
const INACTIVITY_LOCK_MS = 5 * 60 * 1000 // 5 minutes
const TAB_HIDDEN_LOCK_MS = 2 * 60 * 1000  // 2 minutes

export const ToastContext = React.createContext(null)
export const ThemeContext = React.createContext({ theme: 'dark', setTheme: () => {} })

// Hash-based routing (no document names in URL)
function useHashRoute() {
  const [route, setRoute] = useState(() => window.location.hash || '#home')
  useEffect(() => {
    const handler = () => {
      setRoute(window.location.hash || '#home')
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', handler)
    return () => window.removeEventListener('hashchange', handler)
  }, [])
  const navigate = useCallback((hash) => {
    window.location.hash = hash
    window.scrollTo(0, 0)
  }, [])
  return [route, navigate]
}

export default function App() {
  const [unlocked, setUnlocked] = useState(false)
  const [theme, setTheme] = useState('dark')
  const [toasts, setToasts] = useState([])
  const [route, navigate] = useHashRoute()
  const [selectedDomainId, setSelectedDomainId] = useState(null)
  const [previewDoc, setPreviewDoc] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [inactivityWarning, setInactivityWarning] = useState(false)
  const [cmdOpen, setCmdOpen] = useState(false)
  const tabHiddenAt = useRef(null)
  const inactivityTimer = useRef(null)

  // Apply theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  // Global keyboard shortcuts (Ctrl/Cmd+K for Command Palette, "/" to focus Search)
  useEffect(() => {
    if (!unlocked) return
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setCmdOpen((o) => !o)
      } else if (e.key === '/' && !cmdOpen) {
        const activeTag = document.activeElement?.tagName?.toLowerCase()
        if (activeTag !== 'input' && activeTag !== 'textarea') {
          e.preventDefault()
          const searchInput = document.getElementById('doc-search')
          searchInput?.focus()
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [unlocked, cmdOpen])

  // Activity tracking
  const resetInactivity = useCallback(() => {
    touchActivity()
    setInactivityWarning(false)
    clearTimeout(inactivityTimer.current)
    if (unlocked) {
      inactivityTimer.current = setTimeout(() => {
        setInactivityWarning(true)
        setTimeout(() => {
          handleLock()
        }, 30000) // 30s warning then lock
      }, INACTIVITY_LOCK_MS - 30000)
    }
  }, [unlocked])

  useEffect(() => {
    if (!unlocked) return
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll', 'mousemove']
    events.forEach(e => window.addEventListener(e, resetInactivity, { passive: true }))
    resetInactivity()
    return () => {
      events.forEach(e => window.removeEventListener(e, resetInactivity))
      clearTimeout(inactivityTimer.current)
    }
  }, [unlocked, resetInactivity])

  // Tab visibility lock
  useEffect(() => {
    const handler = () => {
      if (document.hidden) {
        tabHiddenAt.current = Date.now()
      } else {
        if (tabHiddenAt.current && unlocked) {
          const hiddenFor = Date.now() - tabHiddenAt.current
          if (hiddenFor > TAB_HIDDEN_LOCK_MS) handleLock()
        }
        tabHiddenAt.current = null
      }
    }
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [unlocked])

  const handleUnlock = useCallback(async (password) => {
    const res = await fetch(`/vault/manifest.enc?t=${Date.now()}`, { cache: 'no-cache' })
    if (!res.ok) throw new Error('Vault not found. Run npm run encrypt first.')
    const buf = await res.arrayBuffer()
    const manifest = await decryptManifest(buf, password)
    setVaultSession(password, manifest)
    setUnlocked(true)
    navigate('#home')
  }, [navigate])

  const handleLock = useCallback(() => {
    lockVault()
    setUnlocked(false)
    setSelectedDomainId(null)
    setPreviewDoc(null)
    setSearchQuery('')
    setCmdOpen(false)
    setInactivityWarning(false)
    clearTimeout(inactivityTimer.current)
    navigate('#lock')
  }, [navigate])

  const addToast = useCallback((message, icon = '✓', duration = 2500) => {
    const id = Math.random().toString(36).slice(2)
    setToasts(ts => [...ts, { id, message, icon }])
    setTimeout(() => {
      setToasts(ts => ts.filter(t => t.id !== id))
    }, duration)
  }, [])

  // Route: determine current screen
  const manifest = getManifest()

  // Parse route
  let screen = 'lock'
  if (unlocked) {
    if (route === '#home' || route === '') screen = 'domains'
    else if (route.startsWith('#domain-')) screen = 'documents'
  }

  // Determine background tint
  let bgScreen = 'lock'
  if (unlocked) {
    if (previewDoc) bgScreen = 'preview'
    else if (screen === 'domains') bgScreen = 'home'
    else if (screen === 'documents') bgScreen = 'list'
  }

  const currentDomain = manifest?.domains?.find(d => `#domain-${d.id}` === route)

  const handleDomainClick = (domain) => {
    setSelectedDomainId(domain.id)
    navigate(`#domain-${domain.id}`)
  }

  const handleDocClick = (doc, allDomainDocs) => {
    if (doc.status === 'empty' || doc.type === 'text') return
    setPreviewDoc({ doc, allDomainDocs })
  }

  const handleBack = () => {
    setPreviewDoc(null)
    navigate('#home')
  }

  const handleSearchNavigate = (doc) => {
    setSearchQuery('')
    navigate(`#domain-${doc.domainId}`)
    setTimeout(() => {
      const domain = manifest?.domains?.find(d => d.id === doc.domainId)
      if (domain) {
        const domainDocs = domain.documents.filter(d => d.status !== 'empty' && d.type !== 'text')
        if (doc.status !== 'empty' && doc.type !== 'text') {
          setPreviewDoc({ doc, allDomainDocs: domainDocs })
        }
      }
    }, 100)
  }

  const handleQuickDocClick = (doc) => {
    navigate(`#domain-${doc.domainId}`)
    setTimeout(() => {
      const domain = manifest?.domains?.find((d) => d.id === doc.domainId)
      if (domain && doc.status !== 'empty' && doc.type !== 'text') {
        const domainDocs = domain.documents.filter((d) => d.status !== 'empty' && d.type !== 'text')
        setPreviewDoc({ doc, allDomainDocs: domainDocs })
      }
    }, 120)
  }

  const pageVariants = {
    initial: { opacity: 0, scale: 0.98, y: 16 },
    animate: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.35, ease: [0.4, 0, 0.2, 1] } },
    exit: { opacity: 0, scale: 0.97, y: -16, transition: { duration: 0.2 } },
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      <ToastContext.Provider value={addToast}>
        <ParallaxBackground screen={bgScreen} />
        <div className="app-container">
          {unlocked && (
            <TopBar
              onLock={handleLock}
              theme={theme}
              setTheme={setTheme}
              manifest={manifest}
              onSearchNavigate={handleSearchNavigate}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              onOpenCmd={() => setCmdOpen(true)}
              addToast={addToast}
            />
          )}

          <AnimatePresence mode="wait">
            {!unlocked && (
              <motion.div key="lock" {...pageVariants} style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <LockScreen onUnlock={handleUnlock} />
              </motion.div>
            )}

            {unlocked && screen === 'domains' && (
              <motion.div key="domains" {...pageVariants} style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <DomainGrid
                  manifest={manifest}
                  onDomainClick={handleDomainClick}
                  onQuickDocClick={handleQuickDocClick}
                  onLock={handleLock}
                />
              </motion.div>
            )}

            {unlocked && screen === 'documents' && currentDomain && (
              <motion.div key={`docs-${currentDomain.id}`} {...pageVariants} style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <DocumentList
                  domain={currentDomain}
                  onBack={handleBack}
                  onDocClick={handleDocClick}
                  addToast={addToast}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {previewDoc && (
            <PreviewModal
              doc={previewDoc.doc}
              allDomainDocs={previewDoc.allDomainDocs}
              onClose={() => setPreviewDoc(null)}
              addToast={addToast}
            />
          )}

          {unlocked && (
            <CommandPalette
              isOpen={cmdOpen}
              onClose={() => setCmdOpen(false)}
              manifest={manifest}
              onNavigateDomain={(domain) => {
                setSelectedDomainId(domain.id)
                navigate(`#domain-${domain.id}`)
              }}
              onNavigateDoc={(doc) => {
                handleSearchNavigate(doc)
              }}
              onLock={handleLock}
              theme={theme}
              setTheme={setTheme}
              addToast={addToast}
            />
          )}

          {inactivityWarning && unlocked && (
            <div className="inactivity-warn" role="alert">
              ⏱ Locking due to inactivity in 30s…
            </div>
          )}

          <ToastContainer toasts={toasts} />
        </div>
      </ToastContext.Provider>
    </ThemeContext.Provider>
  )
}

