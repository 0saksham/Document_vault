import React, { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { fetchAndDecrypt, fetchAndDecryptRaw } from '../lib/crypto'
import { getPassword, registerBlobUrl, revokeBlobUrl } from '../lib/vault'
import PdfViewer from './PdfViewer'
import { formatExpiryDate } from './ExpiryBadge'
import {
  CloseIcon,
  DownloadIcon,
  PrintIcon,
  ShareIcon,
  RotateIcon,
  FitWidthIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ShieldIcon,
} from './Icons'
import { createRipple } from '../lib/interactive'
import { playClickSound, triggerHaptic } from '../lib/feedback'

const MIN_SCALE = 0.5
const MAX_SCALE = 5.0

function clamp(val, min, max) {
  return Math.min(Math.max(val, min), max)
}

// Skeleton Shimmer for Document Preview
function DocumentSkeleton() {
  return (
    <div className="doc-skeleton-frame" role="status" aria-label="Decrypting document">
      <div className="skeleton-header">
        <div className="skeleton-emblem shimmer" />
        <div className="skeleton-title-lines">
          <div className="skeleton-line shimmer line-wide" />
          <div className="skeleton-line shimmer line-narrow" />
        </div>
      </div>
      <div className="skeleton-body shimmer" />
      <div className="skeleton-footer">
        <div className="skeleton-line shimmer line-short" />
        <div className="skeleton-badge shimmer" />
      </div>
      <div className="skeleton-status-msg">
        <ShieldIcon size={16} className="skeleton-shield-spin" />
        <span>Decrypting AES-256 payload…</span>
      </div>
    </div>
  )
}

export default function PreviewModal({ doc, allDomainDocs, onClose, addToast }) {
  const [currentDoc, setCurrentDoc] = useState(doc)
  const [blobUrl, setBlobUrl] = useState(null)
  const [pdfBytes, setPdfBytes] = useState(null)
  const [numPages, setNumPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Transforms
  const [scale, setScale] = useState(1)
  const [rotate, setRotate] = useState(0)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [toolbarVisible, setToolbarVisible] = useState(true)

  const dragStart = useRef(null)
  const lastMousePos = useRef({ x: 0, y: 0 })
  const velocity = useRef({ x: 0, y: 0 })
  const inertiaAnim = useRef(null)
  const hideToolbarTimer = useRef(null)
  const contentRef = useRef(null)
  const rawBytesRef = useRef(null)
  const touchState = useRef({
    initialDist: null,
    initialScale: 1,
    startX: null,
    startY: null,
    lastTap: 0,
  })

  const curIdx = allDomainDocs.findIndex((d) => d.id === currentDoc.id)
  const prevIdx = curIdx - 1
  const nextIdx = curIdx + 1
  const prevDoc = prevIdx >= 0 ? allDomainDocs[prevIdx] : null
  const nextDoc = nextIdx < allDomainDocs.length ? allDomainDocs[nextIdx] : null
  const currentPosition = `${curIdx + 1} / ${allDomainDocs.length}`

  const isPdf =
    currentDoc.mimeType?.includes('pdf') || currentDoc.cleanName?.toLowerCase().endsWith('.pdf')
  const isImage =
    currentDoc.mimeType?.includes('image') ||
    /\.(png|jpe?g|webp|gif|svg)$/i.test(currentDoc.cleanName || '')

  const isTransformed = scale !== 1 || rotate !== 0 || offset.x !== 0 || offset.y !== 0

  const resetTransform = useCallback(() => {
    cancelAnimationFrame(inertiaAnim.current)
    setScale(1)
    setRotate(0)
    setOffset({ x: 0, y: 0 })
  }, [])

  const cleanupBlob = useCallback(() => {
    if (blobUrl) {
      revokeBlobUrl(blobUrl)
      setBlobUrl(null)
    }
  }, [blobUrl])

  // Toolbar auto-hide after 3.5 seconds of inactivity
  const showToolbarTemporarily = useCallback(() => {
    setToolbarVisible(true)
    clearTimeout(hideToolbarTimer.current)
    hideToolbarTimer.current = setTimeout(() => {
      setToolbarVisible(false)
    }, 3500)
  }, [])

  useEffect(() => {
    showToolbarTemporarily()
    return () => clearTimeout(hideToolbarTimer.current)
  }, [showToolbarTemporarily])

  // Load and decrypt document
  useEffect(() => {
    let isCancelled = false
    setLoading(true)
    setError(null)
    setPdfBytes(null)
    rawBytesRef.current = null
    cleanupBlob()
    resetTransform()
    showToolbarTemporarily()

    const timeoutTimer = setTimeout(() => {
      if (!isCancelled && loading) {
        setError('Could not open this document (timed out)')
        setLoading(false)
      }
    }, 15000)

    const password = getPassword()
    if (!password) {
      setError('Vault session expired. Please unlock again.')
      setLoading(false)
      clearTimeout(timeoutTimer)
      return
    }

    async function loadDocument() {
      try {
        if (isPdf) {
          const rawBuffer = await fetchAndDecryptRaw(currentDoc.fileId, password)
          if (isCancelled) return

          rawBytesRef.current = rawBuffer
          setPdfBytes(rawBuffer)
          setLoading(false)
          clearTimeout(timeoutTimer)
        } else {
          const url = await fetchAndDecrypt(
            currentDoc.fileId,
            currentDoc.mimeType || 'image/png',
            password
          )
          if (isCancelled) {
            URL.revokeObjectURL(url)
            return
          }

          registerBlobUrl(url)
          setBlobUrl(url)
          fetchAndDecryptRaw(currentDoc.fileId, password)
            .then((buf) => {
              if (!isCancelled) rawBytesRef.current = buf
            })
            .catch(() => {})

          setLoading(false)
          clearTimeout(timeoutTimer)
        }
      } catch (err) {
        if (isCancelled) return
        clearTimeout(timeoutTimer)
        setError(`Could not open this document. ${err.message || ''}`)
        setLoading(false)
      }
    }

    loadDocument()

    return () => {
      isCancelled = true
      clearTimeout(timeoutTimer)
      cleanupBlob()
    }
  }, [currentDoc.id, currentDoc.fileId, currentDoc.mimeType, isPdf])

  // Document navigation
  const goTo = useCallback(
    (targetDoc) => {
      if (!targetDoc) return
      playClickSound()
      triggerHaptic(15)
      cleanupBlob()
      setCurrentDoc(targetDoc)
    },
    [cleanupBlob]
  )

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      showToolbarTemporarily()
      if (e.key === 'Escape') onClose()
      if (e.key === '+' || e.key === '=') handleZoom(0.25)
      if (e.key === '-') handleZoom(-0.25)
      if (e.key === '0') resetTransform()
      if (e.key === 'r' || e.key === 'R') setRotate((r) => (r + 90) % 360)
      if (e.key === 'ArrowLeft' && prevDoc) goTo(prevDoc)
      if (e.key === 'ArrowRight' && nextDoc) goTo(nextDoc)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, prevDoc, nextDoc, resetTransform, goTo, showToolbarTemporarily])

  const handleZoom = (delta) => {
    cancelAnimationFrame(inertiaAnim.current)
    setScale((s) => clamp(s + delta, MIN_SCALE, MAX_SCALE))
  }

  const handleFitWidth = () => {
    cancelAnimationFrame(inertiaAnim.current)
    setScale(1.15)
    setOffset({ x: 0, y: 0 })
  }

  const handleDblClick = () => {
    cancelAnimationFrame(inertiaAnim.current)
    if (scale > 1.2) {
      resetTransform()
    } else {
      setScale(2.0)
    }
  }

  // Wheel zoom around the cursor position
  const handleWheel = (e) => {
    showToolbarTemporarily()
    if (e.ctrlKey || e.metaKey || scale > 1) {
      e.preventDefault()
      cancelAnimationFrame(inertiaAnim.current)
      const rect = contentRef.current?.getBoundingClientRect() || {
        left: 0,
        top: 0,
        width: window.innerWidth,
        height: window.innerHeight,
      }
      const mouseX = e.clientX - rect.left - rect.width / 2
      const mouseY = e.clientY - rect.top - rect.height / 2

      const factor = e.deltaY < 0 ? 1.15 : 0.88
      const nextScale = clamp(scale * factor, MIN_SCALE, MAX_SCALE)
      const ratio = nextScale / scale

      setOffset((prev) => ({
        x: mouseX - (mouseX - prev.x) * ratio,
        y: mouseY - (mouseY - prev.y) * ratio,
      }))
      setScale(nextScale)
    }
  }

  // Mouse pan handlers with inertia
  const handleMouseDown = (e) => {
    showToolbarTemporarily()
    if (e.button !== 0) return
    cancelAnimationFrame(inertiaAnim.current)
    setIsDragging(true)
    dragStart.current = { x: e.clientX - offset.x, y: e.clientY - offset.y }
    lastMousePos.current = { x: e.clientX, y: e.clientY }
    velocity.current = { x: 0, y: 0 }
  }

  const handleMouseMove = useCallback(
    (e) => {
      showToolbarTemporarily()
      if (!isDragging || !dragStart.current) return
      const currentX = e.clientX
      const currentY = e.clientY

      velocity.current = {
        x: currentX - lastMousePos.current.x,
        y: currentY - lastMousePos.current.y,
      }
      lastMousePos.current = { x: currentX, y: currentY }

      setOffset({
        x: currentX - dragStart.current.x,
        y: currentY - dragStart.current.y,
      })
    },
    [isDragging, showToolbarTemporarily]
  )

  const handleMouseUp = () => {
    if (!isDragging) return
    setIsDragging(false)

    // Inertia decay
    if (Math.hypot(velocity.current.x, velocity.current.y) > 1.2) {
      const applyInertia = () => {
        velocity.current.x *= 0.91
        velocity.current.y *= 0.91
        setOffset((prev) => ({
          x: prev.x + velocity.current.x,
          y: prev.y + velocity.current.y,
        }))

        if (Math.hypot(velocity.current.x, velocity.current.y) > 0.3) {
          inertiaAnim.current = requestAnimationFrame(applyInertia)
        }
      }
      inertiaAnim.current = requestAnimationFrame(applyInertia)
    }
  }

  // Touch handlers: pinch-to-zoom, swipe between docs, double tap
  const handleTouchStart = (e) => {
    showToolbarTemporarily()
    cancelAnimationFrame(inertiaAnim.current)

    if (e.touches.length === 2) {
      // Pinch zoom start
      const d = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      )
      touchState.current.initialDist = d
      touchState.current.initialScale = scale
    } else if (e.touches.length === 1) {
      const touch = e.touches[0]
      touchState.current.startX = touch.clientX
      touchState.current.startY = touch.clientY

      // Double-tap detection
      const now = Date.now()
      if (now - touchState.current.lastTap < 280) {
        handleDblClick()
        touchState.current.lastTap = 0
      } else {
        touchState.current.lastTap = now
      }

      if (scale > 1) {
        setIsDragging(true)
        dragStart.current = { x: touch.clientX - offset.x, y: touch.clientY - offset.y }
        lastMousePos.current = { x: touch.clientX, y: touch.clientY }
      }
    }
  }

  const handleTouchMove = (e) => {
    showToolbarTemporarily()
    if (e.touches.length === 2 && touchState.current.initialDist) {
      const d = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      )
      const newScale = clamp(
        touchState.current.initialScale * (d / touchState.current.initialDist),
        MIN_SCALE,
        MAX_SCALE
      )
      setScale(newScale)
    } else if (e.touches.length === 1 && scale > 1 && isDragging && dragStart.current) {
      const touch = e.touches[0]
      velocity.current = {
        x: touch.clientX - lastMousePos.current.x,
        y: touch.clientY - lastMousePos.current.y,
      }
      lastMousePos.current = { x: touch.clientX, y: touch.clientY }
      setOffset({
        x: touch.clientX - dragStart.current.x,
        y: touch.clientY - dragStart.current.y,
      })
    }
  }

  const handleTouchEnd = (e) => {
    if (touchState.current.initialDist && e.touches.length < 2) {
      touchState.current.initialDist = null
    }

    if (isDragging) {
      setIsDragging(false)
      // Inertia on touch release
      if (Math.hypot(velocity.current.x, velocity.current.y) > 1.2) {
        const applyInertia = () => {
          velocity.current.x *= 0.91
          velocity.current.y *= 0.91
          setOffset((prev) => ({
            x: prev.x + velocity.current.x,
            y: prev.y + velocity.current.y,
          }))

          if (Math.hypot(velocity.current.x, velocity.current.y) > 0.3) {
            inertiaAnim.current = requestAnimationFrame(applyInertia)
          }
        }
        inertiaAnim.current = requestAnimationFrame(applyInertia)
      }
    }

    // Swipe left/right when not zoomed
    if (scale <= 1.05 && touchState.current.startX != null && e.changedTouches[0]) {
      const dx = e.changedTouches[0].clientX - touchState.current.startX
      const dy = e.changedTouches[0].clientY - touchState.current.startY

      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        if (dx < 0 && nextDoc) {
          goTo(nextDoc)
        } else if (dx > 0 && prevDoc) {
          goTo(prevDoc)
        }
      }
    }
    touchState.current.startX = null
    touchState.current.startY = null
  }

  // Download handler
  const handleDownload = (e) => {
    createRipple(e)
    try {
      let tempBlob = null
      let ext = '.pdf'

      if (rawBytesRef.current) {
        const mime = isPdf ? 'application/pdf' : currentDoc.mimeType || 'application/octet-stream'
        tempBlob = new Blob([rawBytesRef.current], { type: mime })
        ext = isPdf ? '.pdf' : currentDoc.mimeType?.includes('png') ? '.png' : '.jpg'
      } else if (blobUrl) {
        const a = document.createElement('a')
        a.href = blobUrl
        a.download = `${currentDoc.cleanName || currentDoc.title}`
        a.click()
        addToast('Download started', '⬇️')
        return
      }

      if (!tempBlob) {
        addToast('File not ready to download', '⚠️')
        return
      }

      const tempUrl = URL.createObjectURL(tempBlob)
      const a = document.createElement('a')
      a.href = tempUrl
      a.download = `${currentDoc.cleanName || currentDoc.title}${ext}`
      a.click()
      setTimeout(() => URL.revokeObjectURL(tempUrl), 1000)
      addToast('Download started', '⬇️')
    } catch {
      addToast('Download failed', '❌')
    }
  }

  // Print handler
  const handlePrint = (e) => {
    createRipple(e)
    try {
      let printUrl = blobUrl
      let shouldRevoke = false

      if (!printUrl && rawBytesRef.current) {
        const mime = isPdf ? 'application/pdf' : 'image/png'
        const blob = new Blob([rawBytesRef.current], { type: mime })
        printUrl = URL.createObjectURL(blob)
        shouldRevoke = true
      }

      if (!printUrl) return

      const printWindow = window.open(printUrl, '_blank')
      if (printWindow) {
        printWindow.addEventListener('load', () => {
          printWindow.print()
          if (shouldRevoke) setTimeout(() => URL.revokeObjectURL(printUrl), 3000)
        })
      }
      if (shouldRevoke) {
        setTimeout(() => URL.revokeObjectURL(printUrl), 10000)
      }
    } catch {
      addToast('Print failed', '❌')
    }
  }

  // Share handler
  const handleShare = async (e) => {
    createRipple(e)
    if (!navigator.share) {
      addToast('Share not supported on this device', '⚠️')
      return
    }
    try {
      let shareBlob = null
      if (rawBytesRef.current) {
        const mime = isPdf ? 'application/pdf' : currentDoc.mimeType || 'image/png'
        shareBlob = new Blob([rawBytesRef.current], { type: mime })
      } else if (blobUrl) {
        const res = await fetch(blobUrl)
        shareBlob = await res.blob()
      }

      if (!shareBlob) return
      const ext = isPdf ? '.pdf' : '.png'
      const file = new File([shareBlob], `${currentDoc.cleanName || currentDoc.title}${ext}`, {
        type: shareBlob.type,
      })

      await navigator.share({
        files: [file],
        title: currentDoc.title,
      })
    } catch {
      addToast('Share cancelled', 'ℹ️')
    }
  }

  return (
    <motion.div
      className="preview-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`Preview: ${currentDoc.title}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onMouseMove={showToolbarTemporarily}
    >
      {/* 1. Floating Glass Toolbar with auto-hide */}
      <div
        className="preview-toolbar glass"
        role="toolbar"
        aria-label="Document toolbar"
        style={{
          transform: toolbarVisible ? 'translateY(0)' : 'translateY(-115%)',
          opacity: toolbarVisible ? 1 : 0,
          transition: 'transform 0.3s ease, opacity 0.3s ease',
        }}
        onMouseEnter={() => {
          clearTimeout(hideToolbarTimer.current)
          setToolbarVisible(true)
        }}
        onMouseLeave={showToolbarTemporarily}
      >
        {/* Document Title & Metadata */}
        <div className="preview-title" title={currentDoc.title}>
          <span className="preview-title-badge">PREVIEW</span>
          <span className="preview-title-text">{currentDoc.title}</span>
          {currentDoc.expiry && (
            <span className="preview-meta-pill" title={`Expires: ${formatExpiryDate(currentDoc.expiry)}`}>
              📅 {formatExpiryDate(currentDoc.expiry)}
            </span>
          )}
          {currentDoc.note && (
            <span className="preview-meta-pill preview-note-pill" title={currentDoc.note}>
              📝 {currentDoc.note}
            </span>
          )}
        </div>

        <div className="toolbar-sep" aria-hidden />

        {/* Zoom Controls */}
        <div className="toolbar-group">
          <button
            className="toolbar-btn"
            onClick={(e) => {
              createRipple(e)
              handleZoom(-0.25)
            }}
            title="Zoom out (-)"
            aria-label="Zoom out"
            id="zoom-out-btn"
          >
            −
          </button>
          <span className="zoom-level-text" title="Current zoom level">
            {Math.round(scale * 100)}%
          </span>
          <button
            className="toolbar-btn"
            onClick={(e) => {
              createRipple(e)
              handleZoom(0.25)
            }}
            title="Zoom in (+)"
            aria-label="Zoom in"
            id="zoom-in-btn"
          >
            +
          </button>
          <button
            className={`toolbar-btn text-btn ${isTransformed ? 'btn-pulse' : ''}`}
            onClick={(e) => {
              createRipple(e)
              resetTransform()
            }}
            title="Reset zoom and rotation (0)"
            aria-label="Reset zoom to 100%"
            id="zoom-reset-btn"
          >
            1:1
          </button>
          <button
            className="toolbar-btn"
            onClick={(e) => {
              createRipple(e)
              handleFitWidth()
            }}
            title="Fit to width"
            aria-label="Fit to width"
            id="fit-width-btn"
          >
            <FitWidthIcon size={15} />
          </button>
          <button
            className="toolbar-btn"
            onClick={(e) => {
              createRipple(e)
              setRotate((r) => (r + 90) % 360)
            }}
            title="Rotate 90° (R)"
            aria-label="Rotate 90 degrees"
            id="rotate-btn"
          >
            <RotateIcon size={15} />
          </button>
        </div>

        <div className="toolbar-sep" aria-hidden />

        {/* Prev / Next Navigation */}
        <div className="toolbar-group preview-nav-group">
          <button
            className="toolbar-btn nav-btn-compact"
            onClick={(e) => {
              createRipple(e)
              prevDoc && goTo(prevDoc)
            }}
            disabled={!prevDoc}
            title="Previous document (Left arrow or swipe right)"
            aria-label="Previous document"
            id="prev-doc-btn"
          >
            <ChevronLeftIcon size={16} />
          </button>
          <span className="nav-index-text">{currentPosition}</span>
          <button
            className="toolbar-btn nav-btn-compact"
            onClick={(e) => {
              createRipple(e)
              nextDoc && goTo(nextDoc)
            }}
            disabled={!nextDoc}
            title="Next document (Right arrow or swipe left)"
            aria-label="Next document"
            id="next-doc-btn"
          >
            <ChevronRightIcon size={16} />
          </button>
        </div>

        <div className="toolbar-sep" aria-hidden />

        {/* Document Actions (Download, Print, Share) */}
        {!loading && !error && (
          <div className="toolbar-group">
            <button
              className="toolbar-btn"
              onClick={handleDownload}
              title="Download document"
              aria-label="Download document"
              id="download-btn"
            >
              <DownloadIcon size={16} />
            </button>
            <button
              className="toolbar-btn"
              onClick={handlePrint}
              title="Print document"
              aria-label="Print document"
              id="print-btn"
            >
              <PrintIcon size={16} />
            </button>
            {navigator.share && (
              <button
                className="toolbar-btn"
                onClick={handleShare}
                title="Share document"
                aria-label="Share document"
                id="share-btn"
              >
                <ShareIcon size={16} />
              </button>
            )}
          </div>
        )}

        {/* Close Button */}
        <button
          className="toolbar-btn close-toolbar-btn"
          onClick={(e) => {
            createRipple(e)
            onClose()
          }}
          title="Close preview (Esc)"
          aria-label="Close preview"
          id="close-preview-btn"
        >
          <CloseIcon size={18} />
        </button>
      </div>

      {/* 2. Main Document Viewport with Page-Style Frame */}
      <div
        className="preview-content"
        ref={contentRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={handleDblClick}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          cursor: isDragging ? 'grabbing' : scale > 1 ? 'grab' : 'default',
          overflow: scale > 1 ? 'hidden' : 'auto',
        }}
      >
        {/* Loading State: Skeleton Shimmer */}
        {loading && <DocumentSkeleton />}

        {/* Error State with Retry Button */}
        {error && (
          <div className="preview-error-card glass" role="alert">
            <div className="error-icon-wrap">⚠️</div>
            <h3 className="error-title">Could not open this document</h3>
            <p className="error-desc">{error}</p>
            <button onClick={() => goTo(currentDoc)} className="error-retry-btn">
              Retry Opening
            </button>
          </div>
        )}

        {/* PDF Document Render inside Page Frame */}
        {!loading && !error && isPdf && pdfBytes && (
          <div
            className="preview-viewport-transform"
            style={{
              transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale}) rotate(${rotate}deg)`,
              transformOrigin: 'top center',
              transition: isDragging ? 'none' : 'transform 0.15s ease-out',
            }}
          >
            <div className="doc-page-frame">
              <PdfViewer
                data={pdfBytes}
                onRenderSuccess={(pages) => {
                  setNumPages(pages)
                  setLoading(false)
                }}
                onRenderError={(err) => {
                  setError(`Could not render PDF. ${err.message || ''}`)
                  setLoading(false)
                }}
              />
            </div>
          </div>
        )}

        {/* Image Document Render inside Page Frame */}
        {!loading && !error && isImage && blobUrl && (
          <div
            className="preview-viewport-transform"
            style={{
              transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale}) rotate(${rotate}deg)`,
              transformOrigin: 'center center',
              transition: isDragging ? 'none' : 'transform 0.15s ease-out',
            }}
          >
            <div className="doc-page-frame image-frame">
              <img
                src={blobUrl}
                alt={currentDoc.title}
                className="preview-img"
                draggable={false}
              />
            </div>
          </div>
        )}

        {/* Multi-page badge indicator */}
        {!loading && !error && isPdf && numPages > 1 && (
          <div className="doc-page-indicator glass" aria-label={`Total pages: ${numPages}`}>
            <span>{numPages} Pages</span>
          </div>
        )}
      </div>
    </motion.div>
  )
}
