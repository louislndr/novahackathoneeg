import { useEffect, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, X, Brain, CheckCircle2 } from 'lucide-react'

const FIXATION_RADIUS_PX = 70
const FIXATION_MS = 2000
const MIN_TRIGGER_INTERVAL_MS = 10000
const LOAD_THRESHOLD = 40

const CALIB_POINTS = [
  { id: 0, style: { top: '12%', left: '12%' } },
  { id: 1, style: { top: '12%', right: '12%' } },
  { id: 2, style: { top: '50%', left: '50%', transform: 'translate(-50%,-50%)' } },
  { id: 3, style: { bottom: '12%', left: '12%' } },
  { id: 4, style: { bottom: '12%', right: '12%' } },
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
      className="fixed inset-0 z-[100] bg-[#09080f]/92 backdrop-blur-sm flex flex-col items-center justify-center"
    >
      <div className="text-center mb-8">
        <h2 className="text-lg font-semibold mb-1">Eye Tracking Calibration</h2>
        <p className="text-white/40 text-sm">
          Click each dot <span className="text-white/70">3 times</span> while looking directly at it
        </p>
        <p className="text-white/25 text-xs mt-1">{done}/{CALIB_POINTS.length} complete</p>
      </div>

      {CALIB_POINTS.map(({ id, style }) => {
        const count = clicks[id] || 0
        const complete = count >= 3
        return (
          <motion.button
            key={id}
            onClick={() => handleClick(id)}
            style={{ position: 'absolute', ...style }}
            whileHover={{ scale: 1.15 }}
            whileTap={{ scale: 0.88 }}
            className="focus:outline-none"
          >
            <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${
              complete
                ? 'border-mint-500 bg-mint-500/20'
                : 'border-violet-400/60 bg-violet-500/10 hover:border-violet-400'
            }`}>
              {complete
                ? <CheckCircle2 size={14} className="text-mint-500" />
                : <span className="text-violet-400/60 text-[10px] font-mono">{count}/3</span>
              }
            </div>
            {!complete && (
              <motion.div
                animate={{ scale: [1, 1.9], opacity: [0.5, 0] }}
                transition={{ repeat: Infinity, duration: 1.8, ease: 'easeOut' }}
                className="absolute inset-0 rounded-full border border-violet-400/30"
              />
            )}
          </motion.button>
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
          <span className="text-[10px] font-semibold text-violet-400 uppercase tracking-widest">FrictionFix AI</span>
        </div>
        <button onClick={onDismiss} className="text-white/25 hover:text-white/70 transition-colors">
          <X size={12} />
        </button>
      </div>

      <div className="px-4 pt-3 pb-1">
        <div className="flex items-center gap-2 text-[10px] text-white/30 mb-2">
          <Brain size={9} />
          <span>EEG load: <span className="text-red-400 font-mono">{suggestion.eegLoad}/100</span></span>
          <span>·</span>
          <span>Fixation: {FIXATION_MS / 1000}s</span>
        </div>
        {suggestion.elementLabel && (
          <p className="text-[10px] text-white/25 font-mono mb-3 truncate">
            ↳ {suggestion.elementLabel}
          </p>
        )}
      </div>

      <div className="px-4 pb-4">
        <div className="bg-violet-500/[0.07] border border-violet-500/15 rounded-lg p-3">
          <p className="text-white/85 text-[13px] leading-relaxed">{suggestion.text}</p>
        </div>
      </div>
    </motion.div>
  )
}

export default function GazeTracker({
  enabled, sessionActive, targetUrl, apiKey, eegMode, elapsed, iframeRef, onSuggestion,
}) {
  const [gaze, setGaze] = useState(null)
  const [calibrating, setCalibrating] = useState(false)
  const [inlinesuggestion, setInlineSuggestion] = useState(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [eegLoad, setEegLoad] = useState(0)

  const fixRef = useRef({ x: 0, y: 0, start: null })
  const eegLoadRef = useRef(0)
  const lastTriggerRef = useRef(0)
  const lockedRef = useRef(false)
  const initRef = useRef(false)
  const eegLoadHistory = useRef([30])

  useEffect(() => { eegLoadRef.current = eegLoad }, [eegLoad])

  // Simulate EEG load as a random walk (more organic than formula-based)
  useEffect(() => {
    if (!sessionActive) { setEegLoad(0); return }
    const id = setInterval(() => {
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

  // Init WebGazer once when enabled
  useEffect(() => {
    if (!enabled || initRef.current) return

    const tryInit = () => {
      if (!window.webgazer) return false
      initRef.current = true
      window.webgazer
        .setGazeListener((data) => { if (data) setGaze({ x: data.x, y: data.y }) })
        .showVideo(false)
        .showFaceOverlay(false)
        .showPredictionPoints(false)
        .begin()
        .catch(() => {})
      setCalibrating(true)
      return true
    }

    if (!tryInit()) {
      const poll = setInterval(() => { if (tryInit()) clearInterval(poll) }, 200)
      return () => clearInterval(poll)
    }
  }, [enabled])

  useEffect(() => {
    if (!initRef.current || !window.webgazer) return
    enabled ? window.webgazer.resume() : window.webgazer.pause()
  }, [enabled])

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
      if (apiKey.trim() && targetUrl) {
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

    // Try to get element from iframe if same-origin, fall back to URL-based
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
        // Cross-origin — expected, use coordinate-based fallback
      }
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
  }, [apiKey, targetUrl, iframeRef, onSuggestion])

  if (!enabled) return null

  return (
    <>
      {/* Gaze dot */}
      {gaze && !calibrating && (
        <motion.div
          className="pointer-events-none fixed z-50"
          animate={{ x: gaze.x - 7, y: gaze.y - 7 }}
          transition={{ type: 'spring', stiffness: 600, damping: 40, mass: 0.2 }}
        >
          <div className="w-3.5 h-3.5 rounded-full bg-violet-400/60 border border-violet-300/80 shadow-lg shadow-violet-500/40" />
        </motion.div>
      )}

      {/* Analyzing pulse */}
      {isAnalyzing && gaze && (
        <motion.div
          className="pointer-events-none fixed z-40 rounded-full border-2 border-violet-400/60"
          style={{ width: 46, height: 46 }}
          animate={{ x: gaze.x - 23, y: gaze.y - 23, scale: [1, 1.7, 1], opacity: [0.8, 0.1, 0.8] }}
          transition={{ repeat: Infinity, duration: 1 }}
        />
      )}

      {/* EEG load badge */}
      {sessionActive && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed top-16 right-4 z-40 flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#0d0b18]/90 backdrop-blur border border-violet-500/20 shadow"
        >
          <motion.div animate={eegLoad > LOAD_THRESHOLD ? { scale: [1, 1.35, 1] } : {}} transition={{ repeat: Infinity, duration: 0.8 }}>
            <Brain size={11} className={eegLoad > LOAD_THRESHOLD ? 'text-red-400' : 'text-violet-400/60'} />
          </motion.div>
          <span className="text-[11px] font-mono text-white/45">
            EEG{' '}
            <span className={`font-semibold ${eegLoad > LOAD_THRESHOLD ? 'text-red-400' : 'text-violet-400'}`}>
              {eegLoad}
            </span>
            <span className="text-white/20">/100</span>
          </span>
        </motion.div>
      )}

      {/* Inline suggestion card */}
      <AnimatePresence>
        {inlinesuggestion && (
          <SuggestionCard suggestion={inlinesuggestion} onDismiss={() => setInlineSuggestion(null)} />
        )}
      </AnimatePresence>

      {/* Calibration */}
      <AnimatePresence>
        {calibrating && <CalibrationOverlay onDone={() => setCalibrating(false)} />}
      </AnimatePresence>
    </>
  )
}
