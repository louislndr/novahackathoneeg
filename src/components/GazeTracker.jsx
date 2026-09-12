import { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence, useMotionValue } from 'framer-motion'
import { Sparkles, X, Brain, CheckCircle2, AlertCircle } from 'lucide-react'

const FIXATION_RADIUS_PX = 70
const FIXATION_MS = 2000
const MIN_TRIGGER_INTERVAL_MS = 10000
const LOAD_THRESHOLD = 40

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
const HEAT_DECAY = 0.03
const MAX_JUMP_PX = 400

// Wait for window.webgazer to be set by the <script defer> tag in index.html.
// The script tag bypasses Vite bundling which breaks MediaPipe's emscripten FaceMesh globals.
function getWebGazer() {
  return new Promise((resolve, reject) => {
    if (window.webgazer) return resolve(window.webgazer)
    let attempts = 0
    const id = setInterval(() => {
      if (window.webgazer) { clearInterval(id); resolve(window.webgazer) }
      else if (++attempts > 80) { clearInterval(id); reject(new Error('WebGazer script did not load')) }
    }, 100)
  })
}

// Module-level singleton — WebGazer must never be begin()'d twice.
let _wg = null
let _wgReady = false
let _wgInitializing = false
// Callbacks registered by components that mounted while begin() was still in flight.
const _pendingAttach = new Set()

export default function GazeTracker({
  enabled, sessionActive, targetUrl, apiKey, iframeRef, onSuggestion,
  onGaze, liveEegLoad, recalibrateKey,
}) {
  // Only state that actually needs to drive renders
  const [wgStatus, setWgStatus] = useState('idle')
  const [wgError, setWgError] = useState(null)
  const [inlinesuggestion, setInlineSuggestion] = useState(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [eegLoad, setEegLoad] = useState(0)
  const [retryCount, setRetryCount] = useState(0)

  // Gaze tracked in a ref — zero React re-renders at 30fps
  const gazeSmoothRef = useRef(null)
  // MotionValues for the pulse so it moves without React re-renders
  const pulseX = useMotionValue(-100)
  const pulseY = useMotionValue(-100)

  // Prop refs — let the stable gaze listener always see current values
  const sessionActiveRef = useRef(sessionActive)
  const apiKeyRef = useRef(apiKey)
  const targetUrlRef = useRef(targetUrl)
  const onGazeRef = useRef(onGaze)
  const onSuggestionRef = useRef(onSuggestion)
  useEffect(() => { sessionActiveRef.current = sessionActive }, [sessionActive])
  useEffect(() => { apiKeyRef.current = apiKey }, [apiKey])
  useEffect(() => { targetUrlRef.current = targetUrl }, [targetUrl])
  useEffect(() => { onGazeRef.current = onGaze }, [onGaze])
  useEffect(() => { onSuggestionRef.current = onSuggestion }, [onSuggestion])

  const fixRef = useRef({ x: 0, y: 0, start: null })
  const eegLoadRef = useRef(0)
  const lastTriggerRef = useRef(0)
  const lastGazeCallRef = useRef(0)
  const lockedRef = useRef(false)
  const initRef = useRef(false)
  const wgRef = useRef(null)
  const wgStatusRef = useRef('idle')
  const eegLoadHistory = useRef([30])
  const liveEegLoadRef = useRef(null)
  const canvasRef = useRef(null)
  const lastHeatTimeRef = useRef(0)

  // Cache getBoundingClientRect — calling it 30fps forces layout reflow each time
  const iframeRectRef = useRef(null)
  const lastRectUpdateRef = useRef(0)
  const getIframeRect = useCallback(() => {
    if (!iframeRef?.current) return null
    const now = Date.now()
    if (!iframeRectRef.current || now - lastRectUpdateRef.current > 500) {
      iframeRectRef.current = iframeRef.current.getBoundingClientRect()
      lastRectUpdateRef.current = now
    }
    return iframeRectRef.current
  }, [iframeRef])

  const drawHeat = useCallback((x, y) => {
    const r = getIframeRect()
    if (!r) return
    if (x < r.left || x > r.right || y < r.top || y > r.bottom) return

    const now = Date.now()
    if (now - lastHeatTimeRef.current < HEAT_THROTTLE_MS) return
    lastHeatTimeRef.current = now

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    const grd = ctx.createRadialGradient(x, y, 0, x, y, HEAT_RADIUS)
    grd.addColorStop(0,   'rgba(255, 245, 50,  0.22)')
    grd.addColorStop(0.2, 'rgba(255, 130, 0,   0.16)')
    grd.addColorStop(0.5, 'rgba(220, 20, 20,   0.09)')
    grd.addColorStop(0.8, 'rgba(140, 0, 50,    0.03)')
    grd.addColorStop(1,   'rgba(0, 0, 0, 0)')

    // source-over keeps colors in the warm range — 'lighter' overflows to white
    ctx.globalCompositeOperation = 'source-over'
    ctx.fillStyle = grd
    ctx.beginPath()
    ctx.arc(x, y, HEAT_RADIUS, 0, Math.PI * 2)
    ctx.fill()
  }, [getIframeRect])

  useEffect(() => { eegLoadRef.current = eegLoad }, [eegLoad])

  useEffect(() => {
    liveEegLoadRef.current = liveEegLoad ?? null
    if (liveEegLoad != null && sessionActive) setEegLoad(Math.round(liveEegLoad))
  }, [liveEegLoad, sessionActive])

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

  // runAnalysis reads live values from refs — stable callback, no dep churn
  const runAnalysis = useCallback(async (gazeX, gazeY) => {
    lockedRef.current = true
    lastTriggerRef.current = Date.now()
    setIsAnalyzing(true)
    setInlineSuggestion(null)
    pulseX.set(gazeX - 23)
    pulseY.set(gazeY - 23)

    const currentLoad = eegLoadRef.current
    const currentApiKey = apiKeyRef.current
    const currentTargetUrl = targetUrlRef.current

    let elementLabel = 'unknown element'
    let elementContext = ''

    if (iframeRef?.current) {
      try {
        const rect = getIframeRect()
        const doc = iframeRef.current.contentDocument
        if (doc && rect) {
          const el = doc.elementFromPoint(gazeX - rect.left, gazeY - rect.top)
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
      } catch {}
    }

    // Report fixation to backend (fire-and-forget)
    onGazeRef.current?.({ elementLabel, x: gazeX, y: gazeY, pageUrl: currentTargetUrl, dwellMs: FIXATION_MS })

    if (!currentApiKey.trim()) {
      setIsAnalyzing(false)
      lockedRef.current = false
      return
    }

    const rect = getIframeRect()
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
          'x-api-key': currentApiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 130,
          messages: [{
            role: 'user',
            content: `UX research tool. A participant is viewing ${currentTargetUrl}.

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

      const entry = { text, x: gazeX, y: gazeY, elementLabel, eegLoad: currentLoad, url: currentTargetUrl }
      setInlineSuggestion(entry)
      onSuggestionRef.current?.(entry)
    } catch (err) {
      const text = err.message.includes('401')
        ? 'Invalid API key — check Signal Setup.'
        : `API error: ${err.message}`
      setInlineSuggestion({ text, x: gazeX, y: gazeY, elementLabel, eegLoad: currentLoad, url: currentTargetUrl })
    } finally {
      setIsAnalyzing(false)
      lockedRef.current = false
    }
  }, [iframeRef, getIframeRect, pulseX, pulseY])

  // Stable gaze listener — does fixation detection inline, never calls setGaze
  const gazeListener = useCallback((data) => {
    if (!data) { gazeSmoothRef.current = null; return }
    // Throttle to ~20fps — face mesh runs at camera fps and saturates the main thread
    const now = Date.now()
    if (now - lastGazeCallRef.current < 50) return
    lastGazeCallRef.current = now
    const prev = gazeSmoothRef.current
    if (prev && Math.sqrt((data.x - prev.x) ** 2 + (data.y - prev.y) ** 2) > MAX_JUMP_PX) return
    const alpha = 0.7
    const smoothed = prev
      ? { x: alpha * data.x + (1 - alpha) * prev.x, y: alpha * data.y + (1 - alpha) * prev.y }
      : { x: data.x, y: data.y }
    gazeSmoothRef.current = smoothed
    drawHeat(smoothed.x, smoothed.y)
    if (wgStatusRef.current !== 'calibrating' && wgStatusRef.current !== 'tracking') {
      wgStatusRef.current = 'tracking'
      setWgStatus('tracking')
    }

    // Fixation detection inline — no setState, no useEffect cycle at 30fps
    if (!sessionActiveRef.current || lockedRef.current) return
    const { x, y } = smoothed
    const fix = fixRef.current
    const dist = Math.sqrt((x - fix.x) ** 2 + (y - fix.y) ** 2)
    if (dist > FIXATION_RADIUS_PX) { fixRef.current = { x, y, start: Date.now() }; return }
    if (!fix.start) { fixRef.current.start = Date.now(); return }
    const fixDuration = Date.now() - fix.start
    const sinceLastTrigger = Date.now() - lastTriggerRef.current
    if (fixDuration >= FIXATION_MS && sinceLastTrigger >= MIN_TRIGGER_INTERVAL_MS) {
      if (targetUrlRef.current) runAnalysis(x, y)
    }
  }, [drawHeat, runAnalysis])

  // WebGazer init/resume/pause
  useEffect(() => {
    if (!enabled) {
      if (_wg) { _wg.pause() }
      wgStatusRef.current = 'idle'
      setWgStatus('idle')
      return
    }

    // Already ready — re-attach listener and resume
    if (_wgReady && _wg) {
      wgRef.current = _wg
      _wg.setGazeListener(gazeListener)
      _wg.resume()
      wgStatusRef.current = 'tracking'
      setWgStatus('tracking')
      setWgError(null)
      return
    }

    // begin() is still in flight — register to attach once it resolves
    if (_wgInitializing) {
      const attach = () => {
        if (!_wg) return
        wgRef.current = _wg
        _wg.setGazeListener(gazeListener)
        wgStatusRef.current = 'tracking'
        setWgStatus('tracking')
        setWgError(null)
      }
      _pendingAttach.add(attach)
      return () => { _pendingAttach.delete(attach) }
    }

    // First-time init
    if (initRef.current) return
    initRef.current = true
    _wgInitializing = true
    setWgError(null)
    wgStatusRef.current = 'calibrating'
    setWgStatus('calibrating')

    getWebGazer().then(async wg => {
      _wg = wg
      wgRef.current = wg
      // Cap resolution and framerate — face mesh is the main thread bottleneck
      wg.params.videoWidth = 320
      wg.params.videoHeight = 240
      wg.params.camConstraints = { video: { width: 320, height: 240, frameRate: { ideal: 20, max: 20 } } }
      wg.clearData()
      wg.saveDataAcrossSessions(false)
      wg.setRegression('ridge')
      // Call each method separately — v3.5.3 may not return `this` from these,
      // so chaining them would silently drop the begin() call
      wg.setGazeListener(gazeListener)
      try { wg.showVideo(false) } catch {}
      try { wg.showFaceOverlay(false) } catch {}
      try { wg.showPredictionPoints(false) } catch {}
      await Promise.resolve(wg.begin())
      _wgReady = true
      _wgInitializing = false
      _pendingAttach.forEach(fn => fn())
      _pendingAttach.clear()
    }).catch(err => {
      _wgInitializing = false
      _wg = null
      initRef.current = false
      wgStatusRef.current = 'error'
      setWgStatus('error')
      setWgError(err?.message || 'Camera access denied or unavailable')
    })
  }, [enabled, gazeListener, retryCount]) // retryCount forces re-run on retry

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
    let skipFrame = false
    const tick = () => {
      skipFrame = !skipFrame
      if (!skipFrame) { // 30fps decay — no need to redraw every vsync
        ctx.globalCompositeOperation = 'destination-out'
        ctx.fillStyle = `rgba(0,0,0,${HEAT_DECAY})`
        ctx.fillRect(0, 0, canvas.width, canvas.height)
      }
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

  // Recalibrate trigger
  useEffect(() => {
    if (!recalibrateKey) return
    gazeSmoothRef.current = null
    setWgStatus('calibrating')
  }, [recalibrateKey])

  if (!enabled) return null

  const calibrating = wgStatus === 'calibrating'

  return createPortal(
    <>
      <canvas
        ref={canvasRef}
        className="pointer-events-none fixed inset-0 z-50"
        style={{ opacity: wgStatus === 'tracking' ? 0.78 : 0 }}
      />

      {/* Analyzing pulse — position driven by motionValues, no React re-renders */}
      {isAnalyzing && (
        <motion.div
          className="pointer-events-none fixed z-40 rounded-full border-2 border-violet-400/60"
          style={{ x: pulseX, y: pulseY, width: 46, height: 46 }}
          animate={{ scale: [1, 1.7, 1], opacity: [0.8, 0.1, 0.8] }}
          transition={{ repeat: Infinity, duration: 1 }}
        />
      )}

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
            <button
              onClick={() => {
                initRef.current = false
                _wgReady = false
                _wgInitializing = false
                _wg = null
                setWgError(null)
                setWgStatus('calibrating')
                setRetryCount(c => c + 1)
              }}
              className="ml-1 text-[10px] text-white/40 hover:text-white/70 underline underline-offset-2"
            >
              retry
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {inlinesuggestion && (
          <SuggestionCard suggestion={inlinesuggestion} onDismiss={() => setInlineSuggestion(null)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {calibrating && <CalibrationOverlay onDone={() => setWgStatus('tracking')} />}
      </AnimatePresence>
    </>,
    document.body
  )
}
