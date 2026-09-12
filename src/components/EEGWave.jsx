import { useEffect, useRef } from 'react'

const CHANNEL_CONFIGS = [
  { freq: 1.0, phase: 0.0, amp: 1.0 },
  { freq: 1.4, phase: 1.3, amp: 0.75 },
  { freq: 0.7, phase: 2.6, amp: 1.15 },
  { freq: 2.1, phase: 0.9, amp: 0.6 },
  { freq: 1.7, phase: 3.5, amp: 0.85 },
  { freq: 0.9, phase: 1.8, amp: 0.95 },
]

export default function EEGWave({ active, hasError = false, height = 80, channelIndex = 0 }) {
  const canvasRef = useRef(null)
  const rafRef = useRef(null)
  const tRef = useRef(0)
  const noiseRef = useRef([])

  useEffect(() => {
    if (!active) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      return
    }

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const cfg = CHANNEL_CONFIGS[channelIndex % CHANNEL_CONFIGS.length]

    // Pre-generate smooth noise
    if (noiseRef.current.length === 0) {
      for (let i = 0; i < 1200; i++) noiseRef.current.push((Math.random() - 0.5) * 2)
    }

    const draw = () => {
      tRef.current += 0.4
      const t = tRef.current
      const w = canvas.width
      const h = canvas.height
      const mid = h / 2
      const amp = hasError ? h * 0.28 : h * 0.18
      const noise = noiseRef.current

      ctx.clearRect(0, 0, w, h)

      // Subtle grid lines
      ctx.strokeStyle = 'rgba(255,255,255,0.025)'
      ctx.lineWidth = 1
      for (let y = h * 0.25; y < h; y += h * 0.25) {
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(w, y)
        ctx.stroke()
      }

      const color = hasError ? '#f87171' : '#00e5a0'
      ctx.beginPath()
      ctx.strokeStyle = color
      ctx.lineWidth = 1.5
      ctx.shadowColor = color
      ctx.shadowBlur = hasError ? 8 : 5

      for (let x = 0; x <= w; x++) {
        const phase = ((x / w) * Math.PI * 6 * cfg.freq) + t * 0.06 + cfg.phase
        const ni = (Math.floor(x + t * 0.3) % noise.length + noise.length) % noise.length
        const smoothNoise = (noise[ni] + (noise[(ni + 1) % noise.length] || 0)) * 0.5
        const wave =
          Math.sin(phase) * amp * cfg.amp +
          Math.sin(phase * 2.4 + 1.1) * amp * 0.35 * cfg.amp +
          Math.sin(phase * 5.1 + 0.7) * amp * 0.15 +
          smoothNoise * (hasError ? amp * 0.12 : amp * 0.06)

        if (x === 0) ctx.moveTo(x, mid + wave)
        else ctx.lineTo(x, mid + wave)
      }
      ctx.stroke()
      ctx.shadowBlur = 0

      rafRef.current = requestAnimationFrame(draw)
    }

    draw()
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [active, hasError, channelIndex])

  if (!active) {
    return (
      <div
        style={{ height }}
        className="flex items-center justify-center text-white/15 text-xs font-mono"
      >
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
      style={{ imageRendering: 'auto' }}
    />
  )
}
