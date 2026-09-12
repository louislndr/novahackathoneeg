import { useEffect, useRef } from 'react'

const CHANNEL_CONFIGS = [
  { freq: 1.0, phase: 0.0, amp: 1.0 },
  { freq: 1.4, phase: 1.3, amp: 0.75 },
  { freq: 0.7, phase: 2.6, amp: 1.15 },
  { freq: 2.1, phase: 0.9, amp: 0.6 },
  { freq: 1.7, phase: 3.5, amp: 0.85 },
  { freq: 0.9, phase: 1.8, amp: 0.95 },
]

// Shared RAF ticker — one animation loop for all active EEGWave instances
const listeners = new Set()
let rafId = null
let tick = 0

function startSharedRaf() {
  if (rafId !== null) return
  const loop = () => {
    tick++
    listeners.forEach(fn => fn(tick))
    rafId = requestAnimationFrame(loop)
  }
  rafId = requestAnimationFrame(loop)
}

function stopSharedRaf() {
  if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null }
}

export default function EEGWave({ active, hasError = false, height = 80, channelIndex = 0 }) {
  const canvasRef = useRef(null)
  const noiseRef = useRef(null)

  useEffect(() => {
    if (!active) return

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { willReadFrequently: false })
    const cfg = CHANNEL_CONFIGS[channelIndex % CHANNEL_CONFIGS.length]

    if (!noiseRef.current) {
      const n = new Float32Array(1200)
      for (let i = 0; i < n.length; i++) n[i] = (Math.random() - 0.5) * 2
      noiseRef.current = n
    }
    const noise = noiseRef.current

    const draw = (t) => {
      const w = canvas.width
      const h = canvas.height
      const mid = h / 2
      const amp = hasError ? h * 0.28 : h * 0.18

      ctx.clearRect(0, 0, w, h)

      // Grid lines — no shadow, just thin strokes
      ctx.strokeStyle = 'rgba(255,255,255,0.025)'
      ctx.lineWidth = 1
      for (let y = h * 0.25; y < h; y += h * 0.25) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke()
      }

      const color = hasError ? '#f87171' : '#00e5a0'
      ctx.beginPath()
      ctx.strokeStyle = color
      ctx.lineWidth = 1.5
      ctx.shadowColor = color
      ctx.shadowBlur = hasError ? 8 : 5

      const step = 2
      for (let x = 0; x <= w; x += step) {
        const phase = ((x / w) * Math.PI * 6 * cfg.freq) + t * 0.06 + cfg.phase
        const ni = (Math.floor(x + t * 0.3) % noise.length + noise.length) % noise.length
        const sn = (noise[ni] + noise[(ni + 1) % noise.length]) * 0.5
        const wave =
          Math.sin(phase) * amp * cfg.amp +
          Math.sin(phase * 2.4 + 1.1) * amp * 0.35 * cfg.amp +
          Math.sin(phase * 5.1 + 0.7) * amp * 0.15 +
          sn * (hasError ? amp * 0.12 : amp * 0.06)

        if (x === 0) ctx.moveTo(x, mid + wave)
        else ctx.lineTo(x, mid + wave)
      }
      ctx.stroke()
      ctx.shadowBlur = 0
    }

    listeners.add(draw)
    startSharedRaf()

    return () => {
      listeners.delete(draw)
      if (listeners.size === 0) stopSharedRaf()
    }
  }, [active, hasError, channelIndex])

  if (!active) {
    return (
      <div style={{ height }} className="flex items-center justify-center text-white/15 text-xs">
        — no signal —
      </div>
    )
  }

  return (
    <canvas
      ref={canvasRef}
      width={400}
      height={height}
      className="w-full block"
    />
  )
}
