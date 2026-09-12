import { useState, useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ShaderGradient, ShaderGradientCanvas } from '@shadergradient/react'
import Sidebar from './components/Sidebar'
import TopBar from './components/TopBar'
import StudyScreen from './screens/StudyScreen'
import ResultsScreen from './screens/ResultsScreen'
import SignalSetup from './screens/SignalSetup'

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
  const [eegWsStatus, setEegWsStatus] = useState('idle') // 'idle'|'connecting'|'connected'|'error'
  const [liveEegLoad, setLiveEegLoad] = useState(null)
  const eegWsRef = useRef(null)

  useEffect(() => {
    if (eegMode !== 'live') {
      eegWsRef.current?.close()
      eegWsRef.current = null
      setEegWsStatus('idle')
      setLiveEegLoad(null)
      return
    }
    setEegWsStatus('connecting')
    const ws = new WebSocket('ws://localhost:4514')
    eegWsRef.current = ws
    ws.onopen  = () => setEegWsStatus('connected')
    ws.onerror = () => setEegWsStatus('error')
    ws.onclose = () => { setEegWsStatus(s => s === 'connected' ? 'error' : s); setLiveEegLoad(null) }
    ws.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data)
        if (typeof d.eegLoad === 'number') setLiveEegLoad(d.eegLoad)
      } catch {}
    }
    return () => { ws.close(); eegWsRef.current = null }
  }, [eegMode])

  useEffect(() => {
    if (!sessionActive) return
    const id = setInterval(() => setElapsed(Date.now() - startTime), 100)
    return () => clearInterval(id)
  }, [sessionActive, startTime])

  function startSession() {
    setSuggestions([])
    const t = Date.now()
    setStartTime(t)
    setElapsed(0)
    setSessionActive(true)
  }

  function stopSession() {
    setSessionActive(false)
    if (suggestions.length > 0) setScreen('results')
  }

  function addSuggestion(entry) {
    setSuggestions(prev => [{ ...entry, id: Date.now(), sessionElapsed: elapsed }, ...prev])
  }

  function resetSession() {
    setSessionActive(false)
    setSuggestions([])
    setElapsed(0)
    setStartTime(null)
    setScreen('study')
  }

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
    eegWsStatus, liveEegLoad,
  }

  return (
    <div className="app-shell flex h-screen text-white overflow-hidden">
      <div className="app-background" aria-hidden="true">
        <ShaderGradientCanvas
          pointerEvents="none"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        >
          <ShaderGradient
            animate="on"
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
        <Sidebar screen={screen} setScreen={setScreen} sessionActive={sessionActive} hasResults={suggestions.length > 0} eegMode={eegMode} gazeEnabled={gazeEnabled} />
        <div className="flex flex-col flex-1 min-w-0">
          <TopBar sessionActive={sessionActive} elapsed={elapsed} eegMode={eegMode} gazeEnabled={gazeEnabled} onNewSession={resetSession} />
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
            </AnimatePresence>
          </main>
        </div>
      </div>
    </div>
  )
}
