import { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, X, Brain, CheckCircle2, AlertCircle } from 'lucide-react'

const FIXATION_RADIUS_PX = 70
const FIXATION_MS = 2000
const MIN_TRIGGER_INTERVAL_MS = 10000
const LOAD_THRESHOLD = 40

// 9-point grid — centering via margin (not CSS transform) so framer-motion
// transforms never conflict with positioning on the center/edge points.
// w-8 = 32px → half = 16px
const CALIB_POINTS = [
  { id: 0, style: { top: '8%',    left: '8%' } },
  { id: 1, style: { top: '8%',    left: '50%',  marginLeft: -16 } },
  { id: 2, style: { top: '8%',    right: '8%' } },
  { id: 3, style: { top: '50%',   left: '8%',   marginTop: -16 } },
  { id: 4, style: { top: '50%',   left: '50%',  marginLeft: -16, marginTop: -16 } },
  { id: 5, style: { top: '50%',   right: '8%',  marginTop: -16 } },
  { id: 6, style: { bottom: '8%', left: '8%' } },
  { id: 7, style: { bottom: '8%', left: '50%',  marginLeft: -16 } },
  { id: 8, style: { bottom: '8%', right: '8%' } },
]

function CalibrationOverlay({ onDone }) {
  const [clicks, setClicks] = useState({})

  function handleClick(id) {
    setClicks(prev => {
      const next = { ...prev, [id]: (prev[id] || 0) + 1 }
      if (Object.values(next).filter(c => c >= 3).length === CALIB_POINTS.length) {
        setTimeout(onDone, 500)
      }
      return next
    })
  }

  const done = Object.values(clicks).filter(c => c >= 3).length

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-[#09080f]/92 backdrop-blur-sm"
    >
      <div className="absolute text-center pointer-events-none select-none" style={{ top: '30%', left: '50%', transform: 'translateX(-50%)' }}>
        <h2 className="text-lg font-semibold mb-1">Eye Tracking Calibration</h2>
        <p className="text-white/40 text-sm">
          Look directly at each dot, then click it <span className="text-white/70">3 times</span>
        </p>
        <p className="text-white/25 text-xs mt-1">Keep your head still · {done}/{CALIB_POINTS.length} complete</p>
      </div>

      {CALIB_POINTS.map(({ id, style }) => {
        const count = clicks[id] || 0
        const complete = count >= 3
        return (
          // Plain button — no scale animation so dots stay perfectly fixed during calibration
          <button
            key={id}
            onClick={() => handleClick(id)}
            style={{ position: 'absolute', ...style }}
            className="focus:outline-none relative"
          >
            <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all duration-200 ${
              complete       ? 'border-green-400 bg-green-400/20'
              : count === 2 ? 'border-violet-300 bg-violet-500/30'
              : count === 1 ? 'border-violet-400 bg-violet-500/20'
              :                'border-violet-500/50 bg-violet-500/[0.08] hover:border-violet-400/70 hover:bg-violet-500/15'
            }`}>
              {complete && <CheckCircle2 size={14} className="text-green-400" />}
            </div>
            {!complete && (
              <motion.div
                animate={{ scale: [1, 1.8], opacity: [0.5, 0] }}
                transition={{ repeat: Infinity, duration: 2, ease: 'easeOut' }}
                className="absolute inset-[-4px] rounded-full border border-violet-400/25 pointer-events-none"
              />
            )}
          </button>
        )
      })}
    </motion.div>
  )
}

function SuggestionCard({ suggestion, onDismiss }) {
  const cardW = 300
  const cardH = 190
  const margin = 20
  const vw = window.innerWidth || 1200
  const vh = window.innerHeight || 800

  const x = Math.min(Math.max(suggestion.x + 18, margin), vw - cardW - margin)
  const y = Math.min(Math.max(suggestion.y - cardH / 2, 70), vh - cardH - margin)

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.88, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.93, y: -6 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      style={{ left: x, top: y, width: cardW, position: 'fixed', zIndex: 80 }}
      className="bg-[#110e1c]/95 backdrop-blur-xl border border-violet-500/25 rounded-xl shadow-2xl shadow-violet-900/30 overflow-hidden"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.05]">
        <div className="flex items-center gap-1.5">
          <Sparkles size={11} className="text-violet-400" />
          <span className="text-xs font-medium text-violet-400">FrictionFix AI</span>
        </div>
        <button onClick={onDismiss} className="text-white/25 hover:text-white/70 transition-colors">
          <X size={12} />
        </button>
      </div>

      <div className="px-4 pt-3 pb-1">
        <div className="flex items-center gap-2 text-[11px] text-white/30 mb-2">
          <Brain size={9} />
          <span>EEG load: <span className="text-red-400">{suggestion.eegLoad}/100</span></span>
          <span>·</span>
          <span>Fixation: {FIXATION_MS / 1000}s</span>
        </div>
        {suggestion.elementLabel && (
          <p className="text-[10px] text-white/25 mb-3 truncate">
            ↳ {suggestion.elementLabel}
          </p>
        )}
      </div>

      <div className="px-4 pb-4">
        <div className="bg-violet-500/[0.07] border border-violet-500/15 rounded-lg p-3">
          <p className="text-white/85 text-sm leading-relaxed">{suggestion.text}</p>
        </div>
      </div>
    </motion.div>
  )
}

const HEAT_THROTTLE_MS = 30
const HEAT_RADIUS = 90
const HEAT_DECAY = 0.018
const MAX_JUMP_PX = 400

// Module-level singleton — WebGazer must never be begin()'d twice.
// Survives component remounts; we pause/resume instead of reinitialising.
let _wg = null
let _wgReady = false

export default function GazeTracker({
  enabled, sessionActive, targetUrl, apiKey, eegMode, elapsed, iframeRef, onSuggestion,
  onGaze, liveEegLoad, recalibrateKey,
}) {
  const [gaze, setGaze] = useState(null)
  const [wgStatus, setWgStatus] = useState('idle') // 'idle' | 'loading' | 'calibrating' | 'tracking' | 'error'
  const [wgError, setWgError] = useState(null)
  const [inlinesuggestion, setInlineSuggestion] = useState(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [eegLoad, setEegLoad] = useState(0)

  const fixRef = useRef({ x: 0, y: 0, start: null })
  const eegLoadRef = useRef(0)
  const lastTriggerRef = useRef(0)
  const lockedRef = useRef(false)
  const initRef = useRef(false)
  const wgRef = useRef(null)
  const eegLoadHistory = useRef([30])
  const liveEegLoadRef = useRef(null)
  const canvasRef = useRef(null)
  const lastHeatTimeRef = useRef(0)
  const gazeSmoothRef = useRef(null)

  // Draw one heat sample — only within the iframe bounds, never on app UI
  const drawHeat = useCallback((x, y) => {
    if (!iframeRef?.current) return
    const r = iframeRef.current.getBoundingClientRect()
    if (x < r.left || x > r.right || y < r.top || y > r.bottom) return

    const now = Date.now()
    if (now - lastHeatTimeRef.current < HEAT_THROTTLE_MS) return
    lastHeatTimeRef.current = now

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    const grd = ctx.createRadialGradient(x, y, 0, x, y, HEAT_RADIUS)
    grd.addColorStop(0,    'rgba(255, 245, 50,  0.14)')
    grd.addColorStop(0.2,  'rgba(255, 130, 0,   0.11)')
    grd.addColorStop(0.5,  'rgba(220, 20, 20,   0.07)')
    grd.addColorStop(0.8,  'rgba(140, 0, 50,    0.025)')
    grd.addColorStop(1,    'rgba(0, 0, 0, 0)')

    ctx.globalCompositeOperation = 'lighter'
    ctx.fillStyle = grd
    ctx.beginPath()
    ctx.arc(x, y, HEAT_RADIUS, 0, Math.PI * 2)
    ctx.fill()
  }, [])

  useEffect(() => { eegLoadRef.current = eegLoad }, [eegLoad])

  // Live EEG from Unicorn — update immediately when a new sample arrives
  useEffect(() => {
    liveEegLoadRef.current = liveEegLoad ?? null
    if (liveEegLoad != null && sessionActive) setEegLoad(Math.round(liveEegLoad))
  }, [liveEegLoad, sessionActive])

  // Simulation fallback — skips each tick when live data is present
  useEffect(() => {
    if (!sessionActive) { setEegLoad(0); return }
    const id = setInterval(() => {
      if (liveEegLoadRef.current != null) return
      setEegLoad(prev => {
        const history = eegLoadHistory.current
        const trend = history.length > 3
          ? (history[history.length - 1] - history[history.length - 4]) / 3
          : 0
        const step = (Math.random() - 0.48) * 8 + trend * 0.3
        const next = Math.min(100, Math.max(10, prev + step))
        eegLoadHistory.current = [...history.slice(-10), next]
        return Math.round(next)
      })
    }, 700)
    return () => clearInterval(id)
  }, [sessionActive])

  // WebGazer init/resume/pause — merged into one effect to avoid double-calls.
  // On first enable: import + begin(). On remount or re-enable: just resume().
  useEffect(() => {
    if (!enabled) {
      if (_wg) { _wg.pause(); setWgStatus('idle') }
      return
    }

    // Already initialised (survived a remount) — just re-attach and resume
    if (_wgReady && _wg) {
      wgRef.current = _wg
      _wg.setGazeListener((data) => {
        if (!data) { gazeSmoothRef.current = null; return }
        const prev = gazeSmoothRef.current
        if (prev && Math.sqrt((data.x - prev.x) ** 2 + (data.y - prev.y) ** 2) > MAX_JUMP_PX) return
        const alpha = 0.55
        const smoothed = prev
          ? { x: alpha * data.x + (1 - alpha) * prev.x, y: alpha * data.y + (1 - alpha) * prev.y }
          : { x: data.x, y: data.y }
        gazeSmoothRef.current = smoothed
        setGaze(smoothed)
        drawHeat(smoothed.x, smoothed.y)
        setWgStatus(s => s === 'calibrating' ? s : 'tracking')
      })
      _wg.resume()
      setWgStatus('tracking')
      setWgError(null)
      return
    }

    // First-time initialisation
    if (initRef.current) return
    initRef.current = true
    setWgError(null)
    setWgStatus('calibrating')

    import('webgazer').then(module => {
      const wg = module.default ?? module
      _wg = wg
      wgRef.current = wg
      wg.clearData()
      wg.saveDataAcrossSessions(false)
      wg.setRegression('weightedRidge')

      wg.setGazeListener((data) => {
        if (!data) { gazeSmoothRef.current = null; return }
        const prev = gazeSmoothRef.current
        if (prev && Math.sqrt((data.x - prev.x) ** 2 + (data.y - prev.y) ** 2) > MAX_JUMP_PX) return
        const alpha = 0.55
        const smoothed = prev
          ? { x: alpha * data.x + (1 - alpha) * prev.x, y: alpha * data.y + (1 - alpha) * prev.y }
          : { x: data.x, y: data.y }
        gazeSmoothRef.current = smoothed
        setGaze(smoothed)
        drawHeat(smoothed.x, smoothed.y)
        setWgStatus(s => s === 'calibrating' ? s : 'tracking')
      })
      .showVideo(false)
      .showFaceOverlay(false)
      .showPredictionPoints(false)
      .begin()
      .then(() => { _wgReady = true })
      .catch(err => {
        setWgStatus('error')
        setWgError(err?.message || 'Camera access denied or unavailable')
        initRef.current = false
        _wg = null
      })
    }).catch(err => {
      setWgStatus('error')
      setWgError('Failed to load WebGazer: ' + (err?.message || err))
      initRef.current = false
    })
  }, [enabled, drawHeat])

  // Pause on unmount so WASM stays alive but stops processing frames
  useEffect(() => {
    return () => {
      if (_wg) _wg.pause()
      gazeSmoothRef.current = null
    }
  }, [])

  // Canvas heat map: init size, run decay loop, handle resize
  useEffect(() => {
    if (wgStatus !== 'tracking') return
    const canvas = canvasRef.current
    if (!canvas) return

    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
    const ctx = canvas.getContext('2d')

    let raf
    const tick = () => {
      // destination-out reduces existing alpha without adding any background colour
      ctx.globalCompositeOperation = 'destination-out'
      ctx.fillStyle = `rgba(0,0,0,${HEAT_DECAY})`
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    const onResize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
    }
  }, [wgStatus])


  // Fixation detection
  useEffect(() => {
    if (!gaze || !sessionActive || lockedRef.current) return

    const { x, y } = gaze
    const fix = fixRef.current
    const dist = Math.sqrt((x - fix.x) ** 2 + (y - fix.y) ** 2)

    if (dist > FIXATION_RADIUS_PX) {
      fixRef.current = { x, y, start: Date.now() }
      return
    }
    if (!fix.start) { fixRef.current.start = Date.now(); return }

    const fixDuration = Date.now() - fix.start
    const sinceLastTrigger = Date.now() - lastTriggerRef.current

    if (fixDuration >= FIXATION_MS && eegLoadRef.current >= LOAD_THRESHOLD && sinceLastTrigger >= MIN_TRIGGER_INTERVAL_MS) {
      if (targetUrl) {
        runAnalysis(x, y)
      }
    }
  }, [gaze, sessionActive, apiKey, targetUrl])

  const runAnalysis = useCallback(async (gazeX, gazeY) => {
    lockedRef.current = true
    lastTriggerRef.current = Date.now()
    setIsAnalyzing(true)
    setInlineSuggestion(null)

    const currentLoad = eegLoadRef.current

    let elementLabel = 'unknown element'
    let elementContext = ''

    if (iframeRef?.current) {
      try {
        const rect = iframeRef.current.getBoundingClientRect()
        const relX = gazeX - rect.left
        const relY = gazeY - rect.top
        const doc = iframeRef.current.contentDocument
        if (doc) {
          const el = doc.elementFromPoint(relX, relY)
          if (el) {
            elementLabel =
              el.getAttribute('placeholder') ||
              el.getAttribute('aria-label') ||
              el.getAttribute('alt') ||
              el.closest('label')?.textContent?.trim() ||
              el.textContent?.trim().slice(0, 60) ||
              el.tagName.toLowerCase()
            elementContext = `Tag: ${el.tagName.toLowerCase()}, classes: ${el.className?.toString().slice(0, 60)}`
          }
        }
      } catch {
        // Cross-origin — expected
      }
    }

    // Report fixation to backend (fire-and-forget)
    onGaze?.({ elementLabel, x: gazeX, y: gazeY, pageUrl: targetUrl, dwellMs: FIXATION_MS })

    // Claude API suggestion requires an API key
    if (!apiKey.trim()) {
      setIsAnalyzing(false)
      lockedRef.current = false
      return
    }

    const rect = iframeRef?.current?.getBoundingClientRect()
    const iframeW = rect?.width || window.innerWidth
    const iframeH = rect?.height || window.innerHeight
    const relX = rect ? Math.round(gazeX - rect.left) : gazeX
    const relY = rect ? Math.round(gazeY - rect.top) : gazeY
    const xPct = Math.round((relX / iframeW) * 100)
    const yPct = Math.round((relY / iframeH) * 100)

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey.trim(),
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 130,
          messages: [{
            role: 'user',
            content: `UX research tool. A participant is viewing ${targetUrl}.

Eye tracking: fixation held for ${FIXATION_MS / 1000}s at position (${xPct}% from left, ${yPct}% from top of the page).
${elementLabel !== 'unknown element' ? `DOM element: "${elementLabel}"${elementContext ? ` — ${elementContext}` : ''}` : `Coordinates suggest the ${xPct < 30 ? 'left' : xPct > 70 ? 'right' : 'center'} ${yPct < 30 ? 'top' : yPct > 70 ? 'bottom' : 'middle'} region of the page.`}
Simulated EEG cognitive load: ${currentLoad}/100 (threshold: ${LOAD_THRESHOLD}).

Give ONE specific, actionable UX suggestion to reduce friction at this element or region. 1–2 sentences max, no preamble.`,
          }],
        }),
      })

      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const text = data.content?.[0]?.text || 'No suggestion returned.'

      const entry = { text, x: gazeX, y: gazeY, elementLabel, eegLoad: currentLoad, url: targetUrl }
      setInlineSuggestion(entry)
      onSuggestion?.(entry)
    } catch (err) {
      const text = err.message.includes('401')
        ? 'Invalid API key — check Signal Setup.'
        : `API error: ${err.message}`
      const entry = { text, x: gazeX, y: gazeY, elementLabel, eegLoad: currentLoad, url: targetUrl }
      setInlineSuggestion(entry)
    } finally {
      setIsAnalyzing(false)
      lockedRef.current = false
    }
  }, [apiKey, targetUrl, iframeRef, onSuggestion, onGaze])

  // Recalibrate trigger from TopBar button
  useEffect(() => {
    if (!recalibrateKey) return
    gazeSmoothRef.current = null
    setWgStatus('calibrating')
  }, [recalibrateKey])

  if (!enabled) return null

  const calibrating = wgStatus === 'calibrating'

  return createPortal(
    <>
      {/* Canvas heat map — additive gaze accumulation with slow decay */}
      <canvas
        ref={canvasRef}
        className="pointer-events-none fixed inset-0 z-50"
        style={{ opacity: wgStatus === 'tracking' ? 0.52 : 0 }}
      />

      {/* Analyzing pulse */}
      {isAnalyzing && gaze && (
        <motion.div
          className="pointer-events-none fixed z-40 rounded-full border-2 border-violet-400/60"
          style={{ width: 46, height: 46 }}
          animate={{ x: gaze.x - 23, y: gaze.y - 23, scale: [1, 1.7, 1], opacity: [0.8, 0.1, 0.8] }}
          transition={{ repeat: Infinity, duration: 1 }}
        />
      )}

      {/* Error badge only — other status handled by TopBar */}
      <AnimatePresence>
        {wgStatus === 'error' && (
          <motion.div
            key="wg-error"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="fixed top-16 right-4 z-40 flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#0d0b18]/90 backdrop-blur border border-red-500/30 shadow"
          >
            <AlertCircle size={11} className="text-red-400" />
            <span className="text-xs text-red-400/80">{wgError || 'Eye tracking failed'}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Inline suggestion card */}
      <AnimatePresence>
        {inlinesuggestion && (
          <SuggestionCard suggestion={inlinesuggestion} onDismiss={() => setInlineSuggestion(null)} />
        )}
      </AnimatePresence>

      {/* Calibration overlay */}
      <AnimatePresence>
        {calibrating && <CalibrationOverlay onDone={() => setWgStatus('tracking')} />}
      </AnimatePresence>
    </>,
    document.body
  )
}
