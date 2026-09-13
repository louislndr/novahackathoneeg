import { useState, useEffect, useRef, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ShaderGradient, ShaderGradientCanvas } from '@shadergradient/react'
import Sidebar from './components/Sidebar'
import TopBar from './components/TopBar'
import StudyScreen from './screens/StudyScreen'
import ResultsScreen from './screens/ResultsScreen'
import SignalSetup from './screens/SignalSetup'
import EEGDataScreen from './screens/EEGDataScreen'
import { FrictionFixClient } from './lib/frictionfix'

export function formatMs(ms) {
  if (ms == null) return '—'
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  return `${m}:${(s % 60).toString().padStart(2, '0')}`
}

export function formatMsLive(ms) {
  if (!ms && ms !== 0) return '0:00.0'
  const tenths = Math.floor(ms / 100)
  const m = Math.floor(tenths / 600)
  const s = Math.floor((tenths % 600) / 10)
  const t = tenths % 10
  return `${m}:${s.toString().padStart(2, '0')}.${t}`
}

const slide = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.22, ease: 'easeOut' } },
  exit: { opacity: 0, y: -10, transition: { duration: 0.16, ease: 'easeIn' } },
}

// ── EEG session analysis ──────────────────────────────────────────────────────

function analyzeEEGSession(log) {
  if (log.length < 4) return { events: [], metrics: null }
  const n = log.length
  const loads = log.map(e => e.load)
  const meanLoad = Math.round(loads.reduce((a, b) => a + b, 0) / n)
  const maxLoad = Math.max(...loads)
  const highLoadPct = Math.round(loads.filter(l => l >= 65).length / n * 100)
  const duration = log[n - 1].elapsed - log[0].elapsed
  // Engagement peaks at moderate load (~47) — Pope et al. (1995) inverted-U
  const meanEngagement = Math.round(
    loads.reduce((acc, l) => acc + Math.max(0, 100 - Math.abs(l - 47) * 1.9), 0) / n
  )
  const events = []

  // Cognitive overload: load >= 65 for >= 2.5s — Berka et al. (2007)
  let oStart = null, oPeak = 0
  for (let i = 0; i < n; i++) {
    const { elapsed, load } = log[i]
    if (load >= 65) {
      if (oStart === null) { oStart = elapsed; oPeak = load }
      else oPeak = Math.max(oPeak, load)
    } else {
      if (oStart !== null && elapsed - oStart >= 2500) {
        events.push({ type: 'cognitive_overload', elapsed: oStart, duration: elapsed - oStart, peakLoad: Math.round(oPeak), severity: oPeak >= 78 ? 'high' : 'medium' })
      }
      oStart = null; oPeak = 0
    }
  }
  if (oStart !== null && log[n - 1].elapsed - oStart >= 2500)
    events.push({ type: 'cognitive_overload', elapsed: oStart, duration: log[n - 1].elapsed - oStart, peakLoad: Math.round(oPeak), severity: oPeak >= 78 ? 'high' : 'medium' })

  // Disengagement: load < 22 + low variance for >= 4s — Freeman et al. (1999)
  let dStart = null, dMin = 100
  const W = 4
  for (let i = 0; i < n; i++) {
    const win = loads.slice(Math.max(0, i - W + 1), i + 1)
    const wm = win.reduce((a, b) => a + b, 0) / win.length
    const variance = win.reduce((acc, v) => acc + (v - wm) ** 2, 0) / win.length
    const { elapsed, load } = log[i]
    if (load < 22 && variance < 40) {
      if (dStart === null) { dStart = elapsed; dMin = load }
      else dMin = Math.min(dMin, load)
    } else {
      if (dStart !== null && elapsed - dStart >= 4000)
        events.push({ type: 'disengagement', elapsed: dStart, duration: elapsed - dStart, minLoad: Math.round(dMin), severity: 'medium' })
      dStart = null; dMin = 100
    }
  }

  return {
    events: events.sort((a, b) => a.elapsed - b.elapsed),
    metrics: { meanLoad, maxLoad, highLoadPct, meanEngagement, duration, sampleCount: n },
  }
}

async function generateAiReport(apiKey, { targetUrl, metrics, events, suggestions }) {
  const fmt = ms => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}` }
  const eventLines = events.length === 0
    ? 'None detected.'
    : events.map(e => e.type === 'cognitive_overload'
        ? `• Cognitive overload at ${fmt(e.elapsed)} — peak load ${e.peakLoad}/100, duration ${fmt(e.duration)} [${e.severity}]`
        : `• Disengagement at ${fmt(e.elapsed)} — load dropped to ${e.minLoad}/100, duration ${fmt(e.duration)}`
      ).join('\n')
  const gazeLines = suggestions.length === 0
    ? 'None captured.'
    : suggestions.slice(0, 6).map(s => `• ${fmt(s.sessionElapsed)}: fixation on "${s.elementLabel || 'page region'}" — EEG load ${s.eegLoad}/100`).join('\n')

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      messages: [{
        role: 'user',
        content: `You are a UX researcher interpreting EEG and eye tracking data from a usability test.

URL: ${targetUrl || 'unknown'}
Duration: ${fmt(metrics.duration)} · Mean cognitive load: ${metrics.meanLoad}/100 · Peak: ${metrics.maxLoad}/100 · High-load time: ${metrics.highLoadPct}% · Engagement: ${metrics.meanEngagement}%

EEG friction events (θ+β/α signal analysis):
${eventLines}

Gaze fixations (eye tracking):
${gazeLines}

Write a UX friction report (150–200 words):
1. One-sentence overall verdict on this page's usability
2. The 2–3 most critical friction points with specific design recommendations
3. One priority action

Be concrete. Address the designer directly. No preamble.`,
      }],
    }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  return data.content?.[0]?.text ?? null
}

export default function App() {
  const [screen, setScreen] = useState('study')
  const [sessionActive, setSessionActive] = useState(false)
  const [targetUrl, setTargetUrl] = useState('')
  const [eegMode, setEegMode] = useState('disconnected')
  const [gazeEnabled, setGazeEnabled] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [startTime, setStartTime] = useState(null)
  const [elapsed, setElapsed] = useState(0)
  const [eegWsStatus, setEegWsStatus] = useState('idle')
  const [liveEegLoad, setLiveEegLoad] = useState(null)
  const [liveEegChannels, setLiveEegChannels] = useState([])
  const [eegStreamInfo, setEegStreamInfo] = useState(null)
  const eegHistoryRef = useRef([]) // circular buffer: last 100 samples per channel
  const [recalibrateKey, setRecalibrateKey] = useState(0)
  const [backendFrictionEvents, setBackendFrictionEvents] = useState([])
  const [isCalibrating, setIsCalibrating] = useState(false)
  const [eegFrictionEvents, setEegFrictionEvents] = useState([])
  const [eegSessionMetrics, setEegSessionMetrics] = useState(null)
  const [aiReport, setAiReport] = useState(null)
  const [isGeneratingReport, setIsGeneratingReport] = useState(false)

  const eegWsRef = useRef(null)
  const backendSessionRef = useRef(null)
  const eegSessionLogRef = useRef([])
  const sessionActiveForLogRef = useRef(false)
  // Ref so addSuggestion never needs elapsed in its deps
  const elapsedRef = useRef(0)
  // Stable refs for closures
  const targetUrlRef = useRef(targetUrl)
  const apiKeyRef = useRef(apiKey)
  const suggestionsRef = useRef(suggestions)
  useEffect(() => { elapsedRef.current = elapsed }, [elapsed])
  useEffect(() => { targetUrlRef.current = targetUrl }, [targetUrl])
  useEffect(() => { apiKeyRef.current = apiKey }, [apiKey])
  useEffect(() => { suggestionsRef.current = suggestions }, [suggestions])

  useEffect(() => {
    if (eegMode !== 'live') {
      eegWsRef.current?.close()
      eegWsRef.current = null
      setEegWsStatus('idle')
      setLiveEegLoad(null)
      setLiveEegChannels([])
      setEegStreamInfo(null)
      eegHistoryRef.current = []
      return
    }
    setEegWsStatus('connecting')
    const ws = new WebSocket('ws://localhost:4514')
    eegWsRef.current = ws
    ws.onopen  = () => setEegWsStatus('searching')
    ws.onerror = () => setEegWsStatus('error')
    ws.onclose = () => { setEegWsStatus(s => s === 'connected' ? 'error' : s); setLiveEegLoad(null) }
    ws.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data)
        if (d.status === 'searching') setEegWsStatus('searching')
        else if (d.status === 'connected') {
          setEegWsStatus('connected')
          setEegStreamInfo({ name: d.name, channels: d.channels, srate: d.srate, host: d.host, device: d.device })
        } else if (d.status === 'error') setEegWsStatus('error')
        if (typeof d.eegLoad === 'number') setLiveEegLoad(d.eegLoad)
        if (Array.isArray(d.channels)) {
          setLiveEegChannels(d.channels)
          const hist = eegHistoryRef.current
          hist.push(d.channels)
          if (hist.length > 100) hist.shift()
        }
      } catch {}
    }
    return () => { ws.close(); eegWsRef.current = null }
  }, [eegMode])

  useEffect(() => {
    if (!sessionActive) return
    const id = setInterval(() => setElapsed(Date.now() - startTime), 100)
    return () => clearInterval(id)
  }, [sessionActive, startTime])

  const startSession = useCallback(async () => {
    setSuggestions([])
    setBackendFrictionEvents([])
    setEegFrictionEvents([])
    setEegSessionMetrics(null)
    setAiReport(null)
    setIsGeneratingReport(false)
    eegSessionLogRef.current = []
    sessionActiveForLogRef.current = true
    const t = Date.now()
    setStartTime(t)
    setElapsed(0)
    setSessionActive(true)

    const url = targetUrlRef.current
    if (url) {
      try {
        const client = new FrictionFixClient()
        const session = await client.create({
          participant_id: 'demo',
          website_url: url,
          source: 'manual',
          policy: 'combined',
          long_gaze_dwell_ms: 2000,
        })
        await client.start(session.session_id)
        backendSessionRef.current = { id: session.session_id, client }
      } catch {}
    }
  }, [])

  const stopSession = useCallback(async () => {
    sessionActiveForLogRef.current = false
    const log = [...eegSessionLogRef.current]
    const { events, metrics } = analyzeEEGSession(log)
    setEegFrictionEvents(events)
    setEegSessionMetrics(metrics)

    setSessionActive(false)
    setScreen('results')

    // Generate AI narrative report
    const key = apiKeyRef.current?.trim()
    if (key && metrics) {
      setIsGeneratingReport(true)
      generateAiReport(key, {
        targetUrl: targetUrlRef.current,
        metrics,
        events,
        suggestions: suggestionsRef.current,
      }).then(report => setAiReport(report))
        .catch(() => {})
        .finally(() => setIsGeneratingReport(false))
    }

    if (backendSessionRef.current) {
      const { id, client } = backendSessionRef.current
      backendSessionRef.current = null
      try {
        await client.end(id, 'completed')
        const data = await client.frictionEvents(id)
        if (data.friction_events?.length > 0) setBackendFrictionEvents(data.friction_events)
      } catch {}
    }
  }, [])

  const addSuggestion = useCallback((entry) => {
    setSuggestions(prev => [{ ...entry, id: Date.now(), sessionElapsed: elapsedRef.current }, ...prev])
  }, [])

  const resetSession = useCallback(() => {
    sessionActiveForLogRef.current = false
    setSessionActive(false)
    setSuggestions([])
    setBackendFrictionEvents([])
    setEegFrictionEvents([])
    setEegSessionMetrics(null)
    setAiReport(null)
    setIsGeneratingReport(false)
    eegSessionLogRef.current = []
    setElapsed(0)
    setStartTime(null)
    if (backendSessionRef.current) {
      const { id, client } = backendSessionRef.current
      backendSessionRef.current = null
      client.end(id, 'abandoned').catch(() => {})
    }
    setScreen('study')
  }, [])

  const sendGaze = useCallback(async ({ elementLabel, x, y, pageUrl, dwellMs }) => {
    const session = backendSessionRef.current
    if (!session) return
    try {
      await session.client.gaze(session.id, {
        element_id: elementLabel && elementLabel !== 'unknown element' ? elementLabel : undefined,
        page_url: pageUrl,
        dwell_ms: dwellMs,
        confidence: 0.8,
        x,
        y,
      })
    } catch {}
  }, [])

  const sendBehaviorEvent = useCallback(async (payload) => {
    const session = backendSessionRef.current
    if (!session) return
    try { await session.client.event(session.id, payload) } catch {}
  }, [])

  const handleRecalibrate = useCallback(() => setRecalibrateKey(k => k + 1), [])

  const handleEegLoad = useCallback((load) => {
    if (!sessionActiveForLogRef.current) return
    eegSessionLogRef.current.push({ elapsed: elapsedRef.current, load })
  }, [])

  const ctx = {
    screen, setScreen,
    sessionActive,
    targetUrl, setTargetUrl,
    eegMode, setEegMode,
    gazeEnabled, setGazeEnabled,
    apiKey, setApiKey,
    suggestions, addSuggestion,
    elapsed,
    startSession, stopSession, resetSession,
    eegWsStatus, liveEegLoad, liveEegChannels, eegStreamInfo, eegHistoryRef,
    recalibrateKey,
    backendFrictionEvents,
    eegFrictionEvents, eegSessionMetrics,
    aiReport, isGeneratingReport,
    sendGaze,
    sendBehaviorEvent,
    onCalibrationChange: setIsCalibrating,
    onEegLoad: handleEegLoad,
  }

  return (
    <div className="app-shell flex h-screen text-white overflow-hidden">
      <div className="app-background" aria-hidden="true">
        <ShaderGradientCanvas
          pointerEvents="none"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        >
          <ShaderGradient
            animate={isCalibrating || sessionActive ? 'off' : 'on'}
            axesHelper="off"
            brightness={1.2}
            cAzimuthAngle={180}
            cDistance={3.6}
            cPolarAngle={90}
            cameraZoom={1}
            color1="#ff5005"
            color2="#dbba95"
            color3="#d0bce1"
            destination="onCanvas"
            envPreset="city"
            grain="on"
            lightType="3d"
            pixelDensity={1}
            positionX={-1.4}
            positionY={0}
            positionZ={0}
            range="disabled"
            rangeEnd={40}
            rangeStart={0}
            reflection={0.1}
            rotationX={0}
            rotationY={10}
            rotationZ={50}
            shader="defaults"
            type="plane"
            uAmplitude={1}
            uDensity={1.3}
            uFrequency={5.5}
            uSpeed={0.4}
            uStrength={4}
            uTime={0}
            wireframe={false}
          />
        </ShaderGradientCanvas>
        <div className="app-background-scrim" />
      </div>

      <div className="relative z-10 flex w-full h-full">
        <Sidebar
          screen={screen}
          setScreen={setScreen}
          sessionActive={sessionActive}
          hasResults={suggestions.length > 0 || backendFrictionEvents.length > 0}
          eegMode={eegMode}
          gazeEnabled={gazeEnabled}
        />
        <div className="flex flex-col flex-1 min-w-0">
          <TopBar
            eegMode={eegMode}
            gazeEnabled={gazeEnabled}
            onNewSession={resetSession}
            onRecalibrate={handleRecalibrate}
          />
          <main className="flex-1 overflow-hidden">
            <AnimatePresence mode="wait">
              {screen === 'study' && (
                <motion.div key="study" variants={slide} initial="initial" animate="animate" exit="exit" className="h-full">
                  <StudyScreen {...ctx} />
                </motion.div>
              )}
              {screen === 'results' && (
                <motion.div key="results" variants={slide} initial="initial" animate="animate" exit="exit" className="h-full">
                  <ResultsScreen {...ctx} />
                </motion.div>
              )}
              {screen === 'signal' && (
                <motion.div key="signal" variants={slide} initial="initial" animate="animate" exit="exit" className="h-full">
                  <SignalSetup {...ctx} />
                </motion.div>
              )}
              {screen === 'eeg' && (
                <motion.div key="eeg" variants={slide} initial="initial" animate="animate" exit="exit" className="h-full">
                  <EEGDataScreen {...ctx} />
                </motion.div>
              )}
            </AnimatePresence>
          </main>
        </div>
      </div>
    </div>
  )
}
