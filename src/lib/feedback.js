/**
 * feedback.js - Web Audio API sound synthesis and haptic vibration feedback.
 * 100% offline, zero network requests, zero audio files.
 * Sound & vibration are OFF by default.
 */

let _soundEnabled = false
let _vibrationEnabled = false
let _audioCtx = null

function getAudioContext() {
  if (typeof window === 'undefined') return null
  const AudioContextClass = window.AudioContext || window.webkitAudioContext
  if (!AudioContextClass) return null
  if (!_audioCtx) {
    _audioCtx = new AudioContextClass()
  }
  if (_audioCtx.state === 'suspended') {
    _audioCtx.resume().catch(() => {})
  }
  return _audioCtx
}

export function isSoundEnabled() {
  return _soundEnabled
}

export function setSoundEnabled(enabled) {
  _soundEnabled = Boolean(enabled)
}

export function isVibrationEnabled() {
  return _vibrationEnabled
}

export function setVibrationEnabled(enabled) {
  _vibrationEnabled = Boolean(enabled)
}

export function triggerHaptic(pattern = 15) {
  if (!_vibrationEnabled) return
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(pattern)
    }
  } catch {}
}

export function playClickSound() {
  if (!_soundEnabled) return
  try {
    const ctx = getAudioContext()
    if (!ctx) return
    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'sine'
    osc.frequency.setValueAtTime(1000, now)
    osc.frequency.exponentialRampToValueAtTime(300, now + 0.03)

    gain.gain.setValueAtTime(0.04, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03)

    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(now)
    osc.stop(now + 0.03)
  } catch {}
}

export function playPopSound() {
  if (!_soundEnabled) return
  try {
    const ctx = getAudioContext()
    if (!ctx) return
    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'sine'
    osc.frequency.setValueAtTime(440, now)
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.06)

    gain.gain.setValueAtTime(0.06, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06)

    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(now)
    osc.stop(now + 0.06)
  } catch {}
}

export function playUnlockSound() {
  if (!_soundEnabled) return
  try {
    const ctx = getAudioContext()
    if (!ctx) return
    const now = ctx.currentTime

    // Two-tone chord chime (D5 & A5)
    ;[587.33, 880, 1174.66].forEach((freq, idx) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      const start = now + idx * 0.06

      osc.type = 'triangle'
      osc.frequency.setValueAtTime(freq, start)

      gain.gain.setValueAtTime(0.05, start)
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.25)

      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(start)
      osc.stop(start + 0.25)
    })
  } catch {}
}

export function playErrorSound() {
  if (!_soundEnabled) return
  try {
    const ctx = getAudioContext()
    if (!ctx) return
    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(160, now)
    osc.frequency.exponentialRampToValueAtTime(70, now + 0.12)

    gain.gain.setValueAtTime(0.07, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12)

    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(now)
    osc.stop(now + 0.12)
  } catch {}
}
