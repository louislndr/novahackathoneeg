import { useEffect, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, X, Brain, Eye, CheckCircle2 } from 'lucide-react'
import { countActiveErrors } from '../App'

const FIXATION_RADIUS_PX = 70
const FIXATION_MS = 2000
const MIN_TRIGGER_INTERVAL_MS = 10000
const LOAD_THRESHOLD = 42

const CALIB_POINTS = [
  { id: 0, top: '12%', left: '12%' },
  { id: 1, top: '12%', right: '12%' },
  { id: 2, top: '50%', left: '50%', transform: 'translate(-50%,-50%)' },
  { id: 3, bottom: '12%', left: '12%' },
  { id: 4, bottom: '12%', right: '12%' },
]

function CalibrationOverlay({ onDone }) {
  const [clicks, setClicks] = useState({})

  function handleClick(id) {
    setClicks(prev => {
      const next = { ...prev, [id]: (prev[id] || 0) + 1 }
      if (Object.values(next).filter(c => c >= 3).length === CALIB_POINTS.length) {
        setTimeout(onDone, 600)
      }
      return next
    })
  }

  const done = Object.values(clicks).filter(c => c >= 3).length
  const total = CALIB_POINTS.length

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-[#09080f]/90 backdrop-blur-sm flex flex-col items-center justify-center"
    >
      <div className="text-center mb-8">
        <div className="flex items-center justify-center gap-2 mb-3">
          <Eye size={18} className="text-violet-400" />
          <h2 className="text-lg font-semibold">Eye Tracking Calibration</h2>
        </div>
        <p className="text-white/40 text-sm">Click each dot <span className="text-white/70">3 times</span> while looking directly at it</p>
        <p className="text-white/25 text-xs mt-1">{done}/{total} points complete</p>
      </div>

      {CALIB_POINTS.map(({ id, ...pos }) => {
        const count = clicks[id] || 0
        const complete = count >= 3
        return (
          <motion.button
            key={id}
            onClick={() => handleClick(id)}
            style={{ position: 'absolute', ...pos }}
            whileHover={{ scale: 1.15 }}
            whileTap={{ scale: 0.9 }}
            className="focus:outline-none"
          >
            <motion.div
              animate={complete ? { scale: [1, 1.3, 1] } : {}}
              className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-colors duration-300 ${
                complete
                  ? 'border-mint-500 bg-mint-500/20'
                  : 'border-violet-400/60 bg-violet-500/10 hover:border-violet-400 hover:bg-violet-500/20'
              }`}
            >
              {complete
                ? <CheckCircle2 size={14} className="text-mint-500" />
                : <span className="text-violet-400/60 text-[10px] font-mono">{count}/3</span>
              }
            </motion.div>
            {!complete && (
              <motion.div
                animate={{ scale: [1, 1.8], opacity: [0.4, 0] }}
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
  const margin = 16
  const cardW = 300
  const cardH = 180

  const rawX = suggestion.x + 20
  const rawY = suggestion.y - cardH / 2
  const x = Math.min(Math.max(rawX, margin), (window.innerWidth || 1200) - cardW - margin)
  const y = Math.min(Math.max(rawY, 70), (window.innerHeight || 800) - cardH - margin)

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.88, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.92, y: -6 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      style={{ left: x, top: y, width: cardW, position: 'fixed', zIndex: 80 }}
      className="bg-[#120e1e]/92 backdrop-blur-xl border border-violet-500/30 rounded-xl shadow-2xl shadow-violet-900/40 overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-1.5">
          <Sparkles size={12} className="text-violet-400" />
          <span className="text-[11px] font-semibold text-violet-400 uppercase tracking-wider">FrictionFix AI</span>
        </div>
        <button onClick={onDismiss} className="text-white/25 hover:text-white/70 transition-colors">
          <X size={13} />
        </button>
      </div>

      {/* Context */}
      <div className="px-4 pt-3 pb-1">
        <div className="flex items-center gap-3 text-[10px] text-white/30 mb-2.5">
          <span className="flex items-center gap-1">
            <Brain size={9} />
            EEG load: <span className="text-red-400 font-mono">{suggestion.eegLoad}/100</span>
          </span>
          <span>·</span>
          <span>Fixation: {(FIXATION_MS / 1000).toFixed(0)}s</span>
        </div>
        <p className="text-[10px] text-white/25 mb-3 font-mono truncate">
          ↳ {suggestion.elementLabel}
        </p>
      </div>

      {/* Suggestion */}
      <div className="px-4 pb-4">
        <div className="bg-violet-500/[0.07] border border-violet-500/15 rounded-lg p-3">
          <p className="text-white/85 text-[13px] leading-relaxed">{suggestion.text}</p>
        </div>
      </div>
    </motion.div>
  )
}

export default function GazeTracker({ enabled, phase, formData, currentTask, apiKey, eegMode, elapsed }) {
  const [gaze, setGaze] = useState(null)
  const [calibrating, setCalibrating] = useState(false)
  const [suggestion, setSuggestion] = useState(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [eegLoad, setEegLoad] = useState(0)

  const fixRef = useRef({ x: 0, y: 0, start: null })
  const eegLoadRef = useRef(0)
  const lastTriggerRef = useRef(0)
  const lockedRef = useRef(false)
  const initRef = useRef(false)

  const running = phase === 'round1' || phase === 'round2'

  // Keep eegLoadRef in sync
  useEffect(() => { eegLoadRef.current = eegLoad }, [eegLoad])

  // Compute simulated EEG load score each second
  useEffect(() => {
    if (!running) { setEegLoad(0); return }
    const id = setInterval(() => {
      const errors = countActiveErrors(formData, currentTask.expected)
      const base = errors * 22
      const timePressure = Math.min(elapsed / 120000, 1) * 12
      const noise = (Math.random() - 0.35) * 18
      setEegLoad(prev => {
        const raw = base + timePressure + noise + 20
        const smoothed = prev * 0.6 + raw * 0.4
        return Math.round(Math.min(100, Math.max(0, smoothed)))
      })
    }, 800)
    return () => clearInterval(id)
  }, [running, formData, currentTask, elapsed])

  // Init WebGazer once when enabled
  useEffect(() => {
    if (!enabled || initRef.current) return

    const tryInit = () => {
      if (!window.webgazer) return false

      initRef.current = true
      window.webgazer
        .setGazeListener((data) => {
          if (data) setGaze({ x: data.x, y: data.y })
        })
        .showVideo(false)
        .showFaceOverlay(false)
        .showPredictionPoints(false)
        .begin()
        .catch(() => {})

      setCalibrating(true)
      return true
    }

    if (!tryInit()) {
      // Poll until the CDN script loads
      const poll = setInterval(() => { if (tryInit()) clearInterval(poll) }, 200)
      return () => clearInterval(poll)
    }
  }, [enabled])

  // Pause WebGazer when disabled
  useEffect(() => {
    if (!enabled && initRef.current && window.webgazer) {
      window.webgazer.pause()
    } else if (enabled && initRef.current && window.webgazer) {
      window.webgazer.resume()
    }
  }, [enabled])

  // Fixation detection
  useEffect(() => {
    if (!gaze || !running || lockedRef.current) return

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
      const el = document.elementFromPoint(x, y)
      if (el && apiKey.trim()) {
        runAnalysis(el, x, y)
      }
    }
  }, [gaze, running, apiKey])

  const runAnalysis = useCallback(async (el, x, y) => {
    lockedRef.current = true
    lastTriggerRef.current = Date.now()
    setIsAnalyzing(true)
    setSuggestion(null)

    // Extract meaningful label from the element
    const tag = el.tagName.toLowerCase()
    const labelEl = el.closest('[class*="panel"], [class*="field"], label')
    const label =
      el.getAttribute('placeholder') ||
      el.getAttribute('aria-label') ||
      el.closest('div')?.querySelector('label')?.textContent?.trim() ||
      el.textContent?.trim().slice(0, 60) ||
      tag
    const type = el.getAttribute('type') || tag
    const currentLoad = eegLoadRef.current

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
          max_tokens: 120,
          messages: [{
            role: 'user',
            content: `UX research context: a user is completing a room-booking form. Eye tracking shows they have been fixating on one element for ${FIXATION_MS / 1000} seconds. Simulated EEG signal indicates cognitive load of ${currentLoad}/100 (threshold: ${LOAD_THRESHOLD}).

Element details:
- Type: ${type}
- Label/placeholder: "${label}"

Give ONE specific, concrete suggestion to reduce friction on this element. Be direct and brief (1–2 sentences, no preamble or hedging).`,
          }],
        }),
      })

      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const text = data.content?.[0]?.text || 'No suggestion available.'
      setSuggestion({ text, x, y, elementLabel: label, eegLoad: currentLoad })
    } catch (err) {
      setSuggestion({
        text: err.message.includes('401')
          ? 'Invalid API key — update it in Signal Setup.'
          : 'Could not reach Claude API. Check your connection and key.',
        x, y,
        elementLabel: label,
        eegLoad: currentLoad,
      })
    } finally {
      setIsAnalyzing(false)
      lockedRef.current = false
    }
  }, [apiKey])

  if (!enabled) return null

  const showDot = gaze && !calibrating

  return (
    <>
      {/* Gaze dot */}
      {showDot && (
        <motion.div
          className="pointer-events-none fixed z-50"
          animate={{ x: gaze.x - 7, y: gaze.y - 7 }}
          transition={{ type: 'spring', stiffness: 600, damping: 40, mass: 0.2 }}
        >
          <div className="w-3.5 h-3.5 rounded-full bg-violet-400/60 border border-violet-300/80 shadow-lg shadow-violet-500/50" />
        </motion.div>
      )}

      {/* Analyzing ring pulse */}
      {isAnalyzing && gaze && (
        <motion.div
          className="pointer-events-none fixed z-40 rounded-full border-2 border-violet-400/70"
          style={{ width: 44, height: 44 }}
          animate={{ x: gaze.x - 22, y: gaze.y - 22, scale: [1, 1.6, 1], opacity: [0.9, 0.1, 0.9] }}
          transition={{ repeat: Infinity, duration: 1 }}
        />
      )}

      {/* EEG load indicator */}
      {running && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed top-16 right-4 z-40 flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#0d0b18]/90 backdrop-blur border border-violet-500/20 shadow"
        >
          <motion.div
            animate={eegLoad > LOAD_THRESHOLD ? { scale: [1, 1.3, 1] } : {}}
            transition={{ repeat: Infinity, duration: 0.8 }}
          >
            <Brain size={11} className={eegLoad > LOAD_THRESHOLD ? 'text-red-400' : 'text-violet-400/60'} />
          </motion.div>
          <span className="text-[11px] font-mono text-white/50">
            EEG load{' '}
            <span className={`font-semibold ${eegLoad > LOAD_THRESHOLD ? 'text-red-400' : 'text-violet-400'}`}>
              {eegLoad}
            </span>
            <span className="text-white/25">/100</span>
          </span>
        </motion.div>
      )}

      {/* AI suggestion card */}
      <AnimatePresence>
        {suggestion && (
          <SuggestionCard
            suggestion={suggestion}
            onDismiss={() => setSuggestion(null)}
          />
        )}
      </AnimatePresence>

      {/* Calibration overlay */}
      <AnimatePresence>
        {calibrating && (
          <CalibrationOverlay onDone={() => setCalibrating(false)} />
        )}
      </AnimatePresence>
    </>
  )
}
