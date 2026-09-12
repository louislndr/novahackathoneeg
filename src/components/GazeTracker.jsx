import { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, X, Brain, CheckCircle2, Loader2, AlertCircle } from 'lucide-react'

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
                ? 'border-green-400 bg-green-400/20'
                : 'border-violet-400/60 bg-violet-500/10 hover:border-violet-400'
            }`}>
              {complete
                ? <CheckCircle2 size={14} className="text-green-400" />
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

const BUBBLE_LIFETIME = 1300
const BUBBLE_THROTTLE_MS = 90
const BUBBLE_MIN_MOVE_PX = 5

export default function GazeTracker({
  enabled, sessionActive, targetUrl, apiKey, eegMode, elapsed, iframeRef, onSuggestion,
}) {
  const [gaze, setGaze] = useState(null)
  const [bubbles, setBubbles] = useState([])
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
  const lastBubbleTimeRef = useRef(0)
  const lastBubblePosRef = useRef({ x: 0, y: 0 })

  const spawnBubble = useCallback((x, y) => {
    const now = Date.now()
    const dx = x - lastBubblePosRef.current.x
    const dy = y - lastBubblePosRef.current.y
    if (now - lastBubbleTimeRef.current < BUBBLE_THROTTLE_MS) return
    if (Math.sqrt(dx * dx + dy * dy) < BUBBLE_MIN_MOVE_PX) return

    lastBubbleTimeRef.current = now
    lastBubblePosRef.current = { x, y }

    const id = now + Math.random()
    const size = 18 + Math.random() * 20
    const driftX = (Math.random() - 0.5) * 14
    const driftY = -(6 + Math.random() * 14)

    setBubbles(prev => [...prev.slice(-14), { id, x, y, size, driftX, driftY }])
    setTimeout(() => setBubbles(prev => prev.filter(b => b.id !== id)), BUBBLE_LIFETIME + 100)
  }, [])

  useEffect(() => { eegLoadRef.current = eegLoad }, [eegLoad])

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

  // Init WebGazer via npm package — no mouse fallback
  useEffect(() => {
    if (!enabled || initRef.current) return
    initRef.current = true
    setWgStatus('loading')
    setWgError(null)

    import('webgazer').then(module => {
      const wg = module.default ?? module
      wgRef.current = wg

      wg.setGazeListener((data) => {
        if (!data) return
        setGaze({ x: data.x, y: data.y })
        spawnBubble(data.x, data.y)
        setWgStatus(s => s === 'calibrating' ? s : 'tracking')
      })
      .showVideo(false)
      .showFaceOverlay(false)
      .showPredictionPoints(false)
      .begin()
      .catch(err => {
        setWgStatus('error')
        setWgError(err?.message || 'Camera access denied or unavailable')
        initRef.current = false
      })

      setWgStatus('calibrating')
    }).catch(err => {
      setWgStatus('error')
      setWgError('Failed to load WebGazer: ' + (err?.message || err))
      initRef.current = false
    })
  }, [enabled, spawnBubble])

  // Pause/resume when enabled toggles after init
  useEffect(() => {
    if (!wgRef.current) return
    if (enabled) {
      wgRef.current.resume()
    } else {
      wgRef.current.pause()
    }
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

    // Deterministic on fixation alone -- 2s+ of steady gaze always counts as a friction
    // point. The old gate also required the ambient simulated EEG random walk to have
    // wandered above 40 at that exact instant, which made whether something got
    // recorded a matter of luck/timing rather than of what actually happened on screen.
    if (fixDuration >= FIXATION_MS && sinceLastTrigger >= MIN_TRIGGER_INTERVAL_MS && targetUrl) {
      runAnalysis(x, y, fixDuration)
    }
  }, [gaze, sessionActive, targetUrl])

  const runAnalysis = useCallback(async (gazeX, gazeY, fixDuration) => {
    lockedRef.current = true
    lastTriggerRef.current = Date.now()
    setIsAnalyzing(true)
    setInlineSuggestion(null)

    // Reported load is derived from actual fixation duration, not the ambient random
    // walk -- the number in the report should reflect what really happened (how long
    // this exact fixation was held), not an independent coin flip. Baseline 40 at the
    // 2s trigger point, scaling up the longer the gaze is held, capped at 96.
    const currentLoad = Math.min(96, LOAD_THRESHOLD + Math.round((fixDuration - FIXATION_MS) / 40))

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

    const rect = iframeRef?.current?.getBoundingClientRect()
    const iframeW = rect?.width || window.innerWidth
    const iframeH = rect?.height || window.innerHeight
    const relX = rect ? Math.round(gazeX - rect.left) : gazeX
    const relY = rect ? Math.round(gazeY - rect.top) : gazeY
    const xPct = Math.round((relX / iframeW) * 100)
    const yPct = Math.round((relY / iframeH) * 100)

    // The trigger condition (fixation + simulated EEG load) has already fired -- this IS
    // a real friction point regardless of what happens next. Record it unconditionally
    // so the report's count is accurate even if the AI call below fails or is skipped;
    // only the suggestion TEXT depends on that call succeeding.
    const entry = { x: gazeX, y: gazeY, elementLabel, eegLoad: currentLoad, url: targetUrl, text: null }

    if (!apiKey.trim()) {
      entry.text = 'Friction point flagged from gaze fixation + simulated EEG load. Add an Anthropic API key in Signal Setup for an AI-written suggestion on this element.'
      setInlineSuggestion(entry)
      onSuggestion?.(entry)
      setIsAnalyzing(false)
      lockedRef.current = false
      return
    }

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
      entry.text = data.content?.[0]?.text || 'No suggestion returned.'
    } catch (err) {
      entry.text = err.message.includes('401')
        ? 'Friction point flagged (AI suggestion failed: invalid API key — check Signal Setup).'
        : `Friction point flagged (AI suggestion failed: ${err.message}).`
    } finally {
      setInlineSuggestion(entry)
      onSuggestion?.(entry)
      setIsAnalyzing(false)
      lockedRef.current = false
    }
  }, [apiKey, targetUrl, iframeRef, onSuggestion])

  if (!enabled) return null

  const calibrating = wgStatus === 'calibrating'

  return createPortal(
    <>
      {/* Bubble trail — only when actively tracking (not loading or calibrating) */}
      {wgStatus === 'tracking' && bubbles.map((bubble) => (
        <motion.div
          key={bubble.id}
          className="pointer-events-none fixed z-50"
          style={{ left: bubble.x - bubble.size / 2, top: bubble.y - bubble.size / 2 }}
          initial={{ opacity: 0.82, scale: 0.18, x: 0, y: 0 }}
          animate={{ opacity: 0, scale: 1, x: bubble.driftX, y: bubble.driftY }}
          transition={{ duration: BUBBLE_LIFETIME / 1000, ease: [0.15, 0, 0.85,1] }}
        >
          <div
            style={{
              width: bubble.size,
              height: bubble.size,
              borderRadius: '50%',
              border: '1.5px solid rgba(167,139,250,0.55)',
              background:
                'radial-gradient(circle at 32% 28%, rgba(255,255,255,0.18) 0%, rgba(139,92,246,0.06) 45%, transparent 70%)',
              boxShadow:
                '0 2px 14px rgba(139,92,246,0.22), inset 0 1px 4px rgba(255,255,255,0.12)',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: '18%',
                left: '22%',
                width: '26%',
                height: '18%',
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.55)',
                filter: 'blur(1.5px)',
              }}
            />
            <div
              style={{
                position: 'absolute',
                bottom: '22%',
                right: '20%',
                width: '12%',
                height: '10%',
                borderRadius: '50%',
                background: 'rgba(200,180,255,0.35)',
                filter: 'blur(1px)',
              }}
            />
          </div>
        </motion.div>
      ))}

      {/* Analyzing pulse */}
      {isAnalyzing && gaze && (
        <motion.div
          className="pointer-events-none fixed z-40 rounded-full border-2 border-violet-400/60"
          style={{ width: 46, height: 46 }}
          animate={{ x: gaze.x - 23, y: gaze.y - 23, scale: [1, 1.7, 1], opacity: [0.8, 0.1, 0.8] }}
          transition={{ repeat: Infinity, duration: 1 }}
        />
      )}

      {/* Status badge — loading / error / tracking */}
      <AnimatePresence>
        {wgStatus === 'loading' && (
          <motion.div
            key="wg-loading"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="fixed top-16 right-4 z-40 flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#0d0b18]/90 backdrop-blur border border-violet-500/20 shadow"
          >
            <Loader2 size={11} className="text-violet-400 animate-spin" />
            <span className="text-[11px] text-white/45">Loading eye tracking…</span>
          </motion.div>
        )}

        {wgStatus === 'error' && (
          <motion.div
            key="wg-error"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="fixed top-16 right-4 z-40 flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#0d0b18]/90 backdrop-blur border border-red-500/30 shadow"
          >
            <AlertCircle size={11} className="text-red-400" />
            <span className="text-[11px] text-red-400/80">{wgError || 'Eye tracking failed'}</span>
          </motion.div>
        )}

        {sessionActive && wgStatus === 'tracking' && (
          <motion.div
            key="wg-eeg"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
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
