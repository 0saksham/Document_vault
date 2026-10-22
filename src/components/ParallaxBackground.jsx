import React, { useRef, useEffect } from 'react'

// Canvas particle field with cursor repulsion & 60fps adaptive throttle
function InteractiveParticles({ mouseRef }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let animId
    let isHidden = document.hidden

    let W = (canvas.width = window.innerWidth)
    let H = (canvas.height = window.innerHeight)

    let particleCount = Math.min(40, Math.floor(W / 35))
    let particles = []

    function initParticles(count) {
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * W,
        y: Math.random() * H,
        baseVx: (Math.random() - 0.5) * 0.3,
        baseVy: -Math.random() * 0.35 - 0.05,
        vx: 0,
        vy: 0,
        r: Math.random() * 1.6 + 0.6,
        alpha: Math.random() * 0.45 + 0.15,
        color: Math.random() > 0.5 ? '124, 92, 255' : '34, 211, 238',
      }))
    }

    initParticles(particleCount)

    let lastFrameTime = performance.now()
    let slowFrames = 0

    function draw(now) {
      if (document.hidden) {
        animId = requestAnimationFrame(draw)
        return
      }

      const dt = now - lastFrameTime
      lastFrameTime = now

      // Adaptive throttle: if frame drops below ~45fps, reduce particle count
      if (dt > 22) {
        slowFrames++
        if (slowFrames > 15 && particleCount > 18) {
          particleCount = Math.floor(particleCount * 0.75)
          initParticles(particleCount)
          slowFrames = 0
        }
      } else {
        slowFrames = Math.max(0, slowFrames - 1)
      }

      ctx.clearRect(0, 0, W, H)

      const mx = mouseRef.current.x
      const my = mouseRef.current.y
      const repulsionRadius = 110

      for (const p of particles) {
        // Natural drift
        p.vx = p.vx * 0.94 + p.baseVx * 0.06
        p.vy = p.vy * 0.94 + p.baseVy * 0.06

        // Cursor repulsion
        if (mx != null && my != null) {
          const dx = p.x - mx
          const dy = p.y - my
          const dist = Math.hypot(dx, dy)
          if (dist < repulsionRadius && dist > 1) {
            const force = (1 - dist / repulsionRadius) * 2.5
            p.vx += (dx / dist) * force
            p.vy += (dy / dist) * force
          }
        }

        p.x += p.vx
        p.y += p.vy

        // Wrap boundaries
        if (p.y < -10) {
          p.y = H + 10
          p.x = Math.random() * W
        }
        if (p.x < -10) p.x = W + 10
        if (p.x > W + 10) p.x = -10

        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${p.color}, ${p.alpha})`
        ctx.fill()
      }

      animId = requestAnimationFrame(draw)
    }

    animId = requestAnimationFrame(draw)

    const onResize = () => {
      W = canvas.width = window.innerWidth
      H = canvas.height = window.innerHeight
      particleCount = Math.min(40, Math.floor(W / 35))
      initParticles(particleCount)
    }

    const onVisibility = () => {
      isHidden = document.hidden
      lastFrameTime = performance.now()
    }

    window.addEventListener('resize', onResize)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', onResize)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [mouseRef])

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
      aria-hidden
    />
  )
}

export default function ParallaxBackground({ screen = 'lock' }) {
  const bgRef = useRef(null)
  const mouseRef = useRef({ x: null, y: null })

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const bg = bgRef.current
    if (!bg) return
    let ticking = false

    const onMouseMove = (e) => {
      mouseRef.current.x = e.clientX
      mouseRef.current.y = e.clientY

      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        const cx = window.innerWidth / 2
        const cy = window.innerHeight / 2
        const dx = (e.clientX - cx) / cx
        const dy = (e.clientY - cy) / cy

        const layers = bg.querySelectorAll('[data-parallax-speed]')
        layers.forEach((el) => {
          const speed = parseFloat(el.dataset.parallaxSpeed)
          el.style.transform = `translate3d(${dx * speed}px, ${dy * speed}px, 0)`
        })
        ticking = false
      })
    }

    const onMouseLeave = () => {
      mouseRef.current.x = null
      mouseRef.current.y = null
    }

    // Mobile Device Orientation support
    const onOrientation = (e) => {
      if (e.gamma == null || e.beta == null || ticking) return
      ticking = true
      requestAnimationFrame(() => {
        const dx = Math.max(-1, Math.min(1, e.gamma / 40))
        const dy = Math.max(-1, Math.min(1, (e.beta - 30) / 40))

        const layers = bg.querySelectorAll('[data-parallax-speed]')
        layers.forEach((el) => {
          const speed = parseFloat(el.dataset.parallaxSpeed) * 0.7
          el.style.transform = `translate3d(${dx * speed}px, ${dy * speed}px, 0)`
        })
        ticking = false
      })
    }

    const onTouchMove = (e) => {
      if (e.touches && e.touches[0]) {
        mouseRef.current.x = e.touches[0].clientX
        mouseRef.current.y = e.touches[0].clientY
      }
    }

    const onTouchEnd = () => {
      mouseRef.current.x = null
      mouseRef.current.y = null
    }

    const onScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        const scrollY = window.scrollY || document.documentElement.scrollTop
        const a1 = bg.querySelector('.aurora-1')
        const a2 = bg.querySelector('.aurora-2')
        if (a1) a1.style.transform = `translate3d(0, ${scrollY * 0.14}px, 0)`
        if (a2) a2.style.transform = `translate3d(0, ${-scrollY * 0.1}px, 0)`
        ticking = false
      })
    }

    window.addEventListener('mousemove', onMouseMove, { passive: true })
    window.addEventListener('mouseleave', onMouseLeave)
    window.addEventListener('touchmove', onTouchMove, { passive: true })
    window.addEventListener('touchend', onTouchEnd)
    window.addEventListener('scroll', onScroll, { passive: true })

    // Check deviceorientation support
    if (typeof window !== 'undefined' && 'DeviceOrientationEvent' in window) {
      window.addEventListener('deviceorientation', onOrientation, { passive: true })
    }

    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseleave', onMouseLeave)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('deviceorientation', onOrientation)
    }
  }, [])

  return (
    <div className={`parallax-bg bg-screen-${screen}`} ref={bgRef} aria-hidden>
      {/* Layer 1: Aurora blobs shifting with screen context */}
      <div className="parallax-layer" data-parallax-speed="18">
        <div className="aurora-blob aurora-1" />
        <div className="aurora-blob aurora-2" />
        <div className="aurora-blob aurora-3" />
        <div className="aurora-blob aurora-4" />
      </div>

      {/* Layer 2: Subtle Cybernetic Dotted Grid */}
      <div className="parallax-layer grid-layer" data-parallax-speed="6" />

      {/* Layer 3: Floating Translucent Shapes with Parallax */}
      <div className="parallax-layer float-shapes-layer" data-parallax-speed="26">
        <div className="floating-shape float-shape-id">
          <svg width="72" height="48" viewBox="0 0 72 48" fill="none">
            <rect x="1" y="1" width="70" height="46" rx="6" stroke="rgba(56, 189, 248, 0.25)" strokeWidth="1.5" fill="rgba(14, 165, 233, 0.04)" />
            <circle cx="16" cy="20" r="7" stroke="rgba(56, 189, 248, 0.3)" strokeWidth="1.5" fill="rgba(56, 189, 248, 0.08)" />
            <line x1="30" y1="16" x2="60" y2="16" stroke="rgba(56, 189, 248, 0.25)" strokeWidth="2" strokeLinecap="round" />
            <line x1="30" y1="24" x2="52" y2="24" stroke="rgba(56, 189, 248, 0.2)" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="10" y1="36" x2="62" y2="36" stroke="rgba(56, 189, 248, 0.15)" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>

        <div className="floating-shape float-shape-doc">
          <svg width="56" height="72" viewBox="0 0 56 72" fill="none">
            <path d="M4 2h34l14 14v52a4 4 0 0 1-4 4H4a4 4 0 0 1-4-4V6a4 4 0 0 1 4-4z" transform="translate(1, 1)" stroke="rgba(168, 85, 247, 0.25)" strokeWidth="1.5" fill="rgba(168, 85, 247, 0.04)" />
            <path d="M38 3v14h14" stroke="rgba(168, 85, 247, 0.25)" strokeWidth="1.5" fill="none" />
            <line x1="12" y1="30" x2="44" y2="30" stroke="rgba(168, 85, 247, 0.2)" strokeWidth="2" strokeLinecap="round" />
            <line x1="12" y1="40" x2="40" y2="40" stroke="rgba(168, 85, 247, 0.18)" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="12" y1="50" x2="32" y2="50" stroke="rgba(168, 85, 247, 0.15)" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>

        <div className="floating-shape float-shape-shield">
          <svg width="58" height="68" viewBox="0 0 58 68" fill="none">
            <path d="M29 64S55 52 55 24V8L29 2 3 8v16c0 28 26 40 26 40z" stroke="rgba(16, 185, 129, 0.22)" strokeWidth="1.5" fill="rgba(16, 185, 129, 0.03)" />
            <circle cx="29" cy="30" r="8" stroke="rgba(16, 185, 129, 0.2)" strokeWidth="1.5" fill="none" />
            <path d="M29 34v8" stroke="rgba(16, 185, 129, 0.25)" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>

        <div className="floating-shape float-shape-stamp">
          <svg width="60" height="60" viewBox="0 0 60 60" fill="none">
            <circle cx="30" cy="30" r="28" stroke="rgba(245, 158, 11, 0.22)" strokeWidth="1.5" strokeDasharray="4 3" fill="rgba(245, 158, 11, 0.03)" />
            <circle cx="30" cy="30" r="20" stroke="rgba(245, 158, 11, 0.18)" strokeWidth="1.2" fill="none" />
            <path d="M30 18l3.5 7 7.5 1-5.5 5.5 1.5 7.5-7-3.5-7 3.5 1.5-7.5-5.5-5.5 7.5-1z" stroke="rgba(245, 158, 11, 0.25)" strokeWidth="1.2" fill="rgba(245, 158, 11, 0.06)" />
          </svg>
        </div>
      </div>

      {/* Layer 4: Interactive Particles */}
      <div className="parallax-layer" data-parallax-speed="12" style={{ opacity: 0.75 }}>
        <InteractiveParticles mouseRef={mouseRef} />
      </div>

      {/* Layer 5: Soft Vignette */}
      <div className="vignette-overlay" />
    </div>
  )
}
