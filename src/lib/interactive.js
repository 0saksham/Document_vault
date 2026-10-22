import { useEffect, useState } from 'react'

/**
 * Creates a material/fluent-style click ripple inside an element.
 */
export function createRipple(e) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const target = e.currentTarget
  if (!target) return

  const rect = target.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  const size = Math.max(rect.width, rect.height) * 2

  const ripple = document.createElement('span')
  ripple.className = 'click-ripple-wave'
  ripple.style.width = `${size}px`
  ripple.style.height = `${size}px`
  ripple.style.left = `${x}px`
  ripple.style.top = `${y}px`

  target.appendChild(ripple)
  setTimeout(() => {
    ripple.remove()
  }, 650)
}

/**
 * Magnetic button pull towards cursor on desktop.
 */
export function useMagnetic(ref, strength = 0.22) {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const el = ref.current
    if (!el) return

    const handleMouseMove = (e) => {
      const rect = el.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      const dx = (e.clientX - cx) * strength
      const dy = (e.clientY - cy) * strength
      el.style.transform = `translate3d(${dx}px, ${dy}px, 0)`
    }

    const handleMouseLeave = () => {
      el.style.transform = ''
    }

    el.addEventListener('mousemove', handleMouseMove, { passive: true })
    el.addEventListener('mouseleave', handleMouseLeave)
    return () => {
      el.removeEventListener('mousemove', handleMouseMove)
      el.removeEventListener('mouseleave', handleMouseLeave)
    }
  }, [ref, strength])
}

/**
 * Fires once when an element enters the viewport.
 */
export function useIntersectionOnce(ref, threshold = 0.15) {
  const [hasEntered, setHasEntered] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') {
      setHasEntered(true)
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setHasEntered(true)
          observer.disconnect()
        }
      },
      { threshold }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [ref, threshold])

  return hasEntered
}

/**
 * Safely clears clipboard after a delay if permitted.
 */
export function scheduleClipboardClear(seconds = 30, onCleared = null) {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return null
  return setTimeout(async () => {
    try {
      if (document.hasFocus()) {
        await navigator.clipboard.writeText('')
        if (onCleared) onCleared()
      }
    } catch {}
  }, seconds * 1000)
}
