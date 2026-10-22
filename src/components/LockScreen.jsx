import React, { useState, useRef, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { DecryptionError } from '../lib/crypto'
import {
  ShieldIcon,
  CpuIcon,
  ClockIcon,
  EyeIcon,
  EyeOffIcon,
  UnlockIcon,
  LockIcon,
  WarningIcon,
} from './Icons'
import { playUnlockSound, playErrorSound, triggerHaptic } from '../lib/feedback'

// Premium glowing vault emblem reacting to keystrokes & password length
function VaultEmblem({ unlocking, passwordLength = 0, isTyping = false }) {
  // Speed up rotation based on typing & length
  const spinSpeed = unlocking ? '0.6s' : isTyping ? '1.8s' : `${Math.max(3, 18 - passwordLength * 1.1)}s`
  const glowRadius = Math.min(6 + passwordLength * 1.5, 26)
  const glowOpacity = 0.35 + Math.min(passwordLength * 0.04, 0.55)

  return (
    <div className={`vault-emblem-container ${unlocking ? 'vault-unlocked' : ''}`} aria-hidden>
      {/* Light burst effect on correct unlock */}
      {unlocking && <div className="vault-light-burst" />}

      {/* Soft circular radial halo behind the SVG scaled by password length */}
      <div
        className="vault-emblem-halo"
        style={{
          transform: `scale(${1 + Math.min(passwordLength * 0.04, 0.35)})`,
          opacity: glowOpacity,
        }}
      />

      <svg
        className="vault-emblem-svg"
        viewBox="0 0 140 140"
        fill="none"
        style={{
          filter: `drop-shadow(0 0 ${glowRadius}px rgba(56, 189, 248, ${glowOpacity * 0.8}))`,
        }}
      >
        <defs>
          <linearGradient id="emblem-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#7c5cff" />
            <stop offset="50%" stopColor="#38bdf8" />
            <stop offset="100%" stopColor="#22d3ee" />
          </linearGradient>
          <linearGradient id="gold-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fbbf24" />
            <stop offset="100%" stopColor="#f59e0b" />
          </linearGradient>
          <linearGradient id="shield-grad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(124, 92, 255, 0.25)" />
            <stop offset="100%" stopColor="rgba(34, 211, 238, 0.08)" />
          </linearGradient>
          <filter id="emblem-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Outer Rotating Ring with variable speed */}
        <g
          className="vault-rotating-ring"
          style={{ animationDuration: spinSpeed }}
        >
          <circle
            cx="70"
            cy="70"
            r="62"
            stroke="url(#emblem-grad)"
            strokeWidth="1.75"
            strokeDasharray="8 6 2 6"
            opacity="0.65"
          />
          <circle cx="70" cy="8" r="3.2" fill="#22d3ee" filter="url(#emblem-glow)" />
          <circle cx="70" cy="132" r="2.5" fill="#7c5cff" opacity="0.8" />
        </g>

        {/* Inner Progress / Unlock Circle */}
        <circle
          cx="70"
          cy="70"
          r="52"
          stroke="url(#emblem-grad)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray="327"
          strokeDashoffset={unlocking ? 0 : Math.max(20, 327 - passwordLength * 16)}
          transform="rotate(-90 70 70)"
          className="vault-progress-ring"
          style={{ transition: 'stroke-dashoffset 0.25s ease-out' }}
        />

        {/* Center Shield Body */}
        <path
          d="M70 26 L96 36 C96 66 84 88 70 98 C56 88 44 66 44 36 Z"
          fill="url(#shield-grad)"
          stroke="url(#emblem-grad)"
          strokeWidth="2"
          filter="url(#emblem-glow)"
        />

        {/* Lock Shackle */}
        <path
          d={unlocking ? 'M62 52 V44 A8 8 0 0 1 78 44' : 'M62 58 V47 A8 8 0 0 1 78 47 V58'}
          stroke="url(#gold-grad)"
          strokeWidth="3.5"
          strokeLinecap="round"
          fill="none"
          className="vault-shackle"
          style={{ transition: 'all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
        />

        {/* Lock Body */}
        <rect
          x="56"
          y="57"
          width="28"
          height="22"
          rx="5"
          fill="url(#emblem-grad)"
          opacity="0.95"
          stroke="rgba(255,255,255,0.4)"
          strokeWidth="1"
        />

        {/* Keyhole */}
        <circle cx="70" cy="66" r="3" fill="#0b1020" />
        <polygon points="68.5,66 71.5,66 72.5,73 67.5,73" fill="#0b1020" />

        {/* Security Sparkles */}
        <circle cx="48" cy="48" r="1.5" fill="#fde68a" opacity="0.8" />
        <circle cx="92" cy="48" r="1.5" fill="#fde68a" opacity="0.8" />
      </svg>
    </div>
  )
}

function getDelay(attempts) {
  if (attempts <= 1) return 0
  return Math.min(Math.pow(2, attempts - 2) * 1000, 30000)
}

export default function LockScreen({ onUnlock }) {
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [shake, setShake] = useState(false)
  const [unlocking, setUnlocking] = useState(false)
  const [attempts, setAttempts] = useState(0)
  const [cooldown, setCooldown] = useState(0)
  const [capsLock, setCapsLock] = useState(false)
  const [isTyping, setIsTyping] = useState(false)
  const typingTimer = useRef(null)
  const formRef = useRef(null)
  const cooldownRef = useRef(null)
  const cardRef = useRef(null)

  const startCooldown = (ms) => {
    if (ms <= 0) return
    let secs = Math.ceil(ms / 1000)
    setCooldown(secs)
    clearInterval(cooldownRef.current)
    cooldownRef.current = setInterval(() => {
      secs--
      setCooldown(secs)
      if (secs <= 0) clearInterval(cooldownRef.current)
    }, 1000)
  }

  useEffect(() => () => {
    clearInterval(cooldownRef.current)
    clearTimeout(typingTimer.current)
  }, [])

  // Detect Caps Lock
  const handleKeyModifier = (e) => {
    if (e.getModifierState) {
      setCapsLock(e.getModifierState('CapsLock'))
    }
  }

  // Handle password typing reaction
  const handlePasswordChange = (e) => {
    setPassword(e.target.value)
    setIsTyping(true)
    clearTimeout(typingTimer.current)
    typingTimer.current = setTimeout(() => setIsTyping(false), 800)
  }

  // Cursor-follow border glow on password card
  const handleCardMouseMove = (e) => {
    const card = cardRef.current
    if (!card) return
    const rect = card.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    card.style.setProperty('--mouse-x', `${x}px`)
    card.style.setProperty('--mouse-y', `${y}px`)
  }

  const handleSubmit = useCallback(
    async (e) => {
      e?.preventDefault()
      if (loading || cooldown > 0) return
      if (!password) {
        setError('Please enter your password.')
        return
      }

      const delay = getDelay(attempts)
      if (delay > 0) {
        startCooldown(delay)
        return
      }

      setLoading(true)
      setError('')
      try {
        await onUnlock(password)
        setUnlocking(true)
        playUnlockSound()
        triggerHaptic(40)
      } catch (err) {
        const newAttempts = attempts + 1
        setAttempts(newAttempts)
        setShake(true)
        playErrorSound()
        triggerHaptic([60, 80, 60])
        setTimeout(() => setShake(false), 600)
        if (err instanceof DecryptionError || err.message?.includes('Wrong')) {
          setError('Incorrect password. Please try again.')
        } else if (err.message?.includes('Vault not found')) {
          setError(err.message)
        } else {
          setError('Something went wrong. Please try again.')
        }
        const nextDelay = getDelay(newAttempts + 1)
        if (nextDelay > 0) startCooldown(nextDelay)
      } finally {
        setLoading(false)
      }
    },
    [password, loading, cooldown, attempts, onUnlock]
  )

  const canSubmit = !loading && !unlocking && cooldown === 0 && password.length > 0

  return (
    <div className="lock-screen">
      {/* Hero Header */}
      <motion.div
        className="lock-hero"
        initial={{ opacity: 0, y: -24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.34, 1.56, 0.64, 1] }}
      >
        <VaultEmblem
          unlocking={unlocking}
          passwordLength={password.length}
          isTyping={isTyping}
        />

        {/* Balanced typography layout: "Digital Documents" on line 1, gradient "Vault" on line 2 */}
        <h1 className="lock-title">
          <span className="lock-title-line1">Digital Documents</span>
          <span className="lock-title-line2 gradient-text">Vault</span>
        </h1>

        <p className="lock-subtitle">
          Your life's paperwork, one secure place.
          <span className="lock-subtitle-hindi">आपके सारे दस्तावेज़, एक सुरक्षित जगह।</span>
        </p>
      </motion.div>

      {/* Password Card with glowing animated border & cursor-follow glow */}
      <motion.div
        className={`lock-card-outer ${unlocking ? 'card-unlocking-zoom' : ''}`}
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.12, ease: [0.34, 1.56, 0.64, 1] }}
      >
        <div
          ref={cardRef}
          className={`glass lock-card-inner ${shake ? 'shake-red-pulse' : ''}`}
          onMouseMove={handleCardMouseMove}
        >
          <div className="card-cursor-glow" aria-hidden />

          <form
            className="lock-form"
            onSubmit={handleSubmit}
            ref={formRef}
            noValidate
          >
            <div className="lock-input-header-row">
              <label htmlFor="vault-password" className="lock-input-label">
                Master Passphrase
              </label>
              {capsLock && (
                <div className="capslock-warning-chip" role="alert">
                  <WarningIcon size={12} />
                  <span>Caps Lock is ON</span>
                </div>
              )}
            </div>

            <div className="input-wrap">
              <input
                className="password-input"
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={handlePasswordChange}
                onKeyDown={handleKeyModifier}
                onKeyUp={handleKeyModifier}
                placeholder="Enter vault password"
                autoComplete="current-password"
                disabled={loading || unlocking || cooldown > 0}
                aria-label="Vault password"
                id="vault-password"
                autoFocus
              />
              <button
                type="button"
                className="toggle-btn"
                onClick={() => setShowPw((s) => !s)}
                aria-label={showPw ? 'Hide password' : 'Show password'}
                tabIndex={0}
              >
                {showPw ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
              </button>
            </div>

            {error && (
              <p className="lock-error" role="alert">
                {error}
              </p>
            )}
            {cooldown > 0 && (
              <p className="lock-error" role="status">
                Too many attempts. Wait {cooldown}s before trying again.
              </p>
            )}

            <button
              type="submit"
              className={`unlock-btn ${loading ? 'is-loading' : ''} ${cooldown > 0 ? 'is-cooldown' : ''}`}
              disabled={!canSubmit}
              aria-label="Unlock the vault"
            >
              <span className="unlock-btn-content">
                {loading ? (
                  <>
                    <span className="loading-ring-spinner" aria-hidden />
                    <span>Deriving Keys (PBKDF2)…</span>
                  </>
                ) : unlocking ? (
                  <>
                    <UnlockIcon size={18} />
                    <span>Vault Unlocked!</span>
                  </>
                ) : cooldown > 0 ? (
                  <>
                    <ClockIcon size={18} />
                    <span>Retry in {cooldown}s</span>
                  </>
                ) : (
                  <>
                    <LockIcon size={18} />
                    <span>Unlock Vault</span>
                  </>
                )}
              </span>
            </button>
          </form>
        </div>

        {/* 3 verified security feature chips */}
        <div className="lock-chips-row" role="list">
          <div className="lock-chip" role="listitem">
            <ShieldIcon size={14} className="lock-chip-icon" />
            <span>AES-256 encrypted</span>
          </div>
          <div className="lock-chip" role="listitem">
            <CpuIcon size={14} className="lock-chip-icon" />
            <span>Decrypts only in your browser</span>
          </div>
          <div className="lock-chip" role="listitem">
            <ClockIcon size={14} className="lock-chip-icon" />
            <span>Auto-locks</span>
          </div>
        </div>
      </motion.div>

      {/* Security notice footer */}
      <p className="lock-footer">
        Zero cloud persistence · PBKDF2-SHA256 (600k rounds) + AES-256-GCM
      </p>
    </div>
  )
}
