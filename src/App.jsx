import { useState, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import Sidebar from './components/Sidebar'
import TopBar from './components/TopBar'
import StudyScreen from './screens/StudyScreen'
import ResultsScreen from './screens/ResultsScreen'
import SignalSetup from './screens/SignalSetup'

export const TASKS = {
  round1: {
    id: 'round1',
    roundLabel: 'Round 1 · Baseline',
    title: 'Quarterly Review Booking',
    instruction:
      'A colleague has asked you to reserve a meeting room for the upcoming quarterly review. Complete the booking using exactly the details shown below.',
    details: [
      { label: 'Room', value: 'Pinecrest Boardroom', key: 'location' },
      { label: 'Date', value: 'October 14, 2026', key: 'date' },
      { label: 'Start time', value: '2:00 PM', key: 'time' },
      { label: 'Attendees', value: '8', key: 'attendees' },
      { label: 'Room setup', value: 'Theater', key: 'roomSetup' },
      { label: 'Reference', value: 'MTNG-447', key: 'bookingRef' },
    ],
    expected: {
      location: 'Pinecrest Boardroom',
      date: 'October 14, 2026',
      time: '2:00 PM',
      attendees: '8',
      roomSetup: 'Theater',
      bookingRef: 'MTNG-447',
    },
  },
  round2: {
    id: 'round2',
    roundLabel: 'Round 2 · Adaptive',
    title: 'Team Workshop Booking',
    instruction:
      'You need to arrange a room for an upcoming team workshop. Complete the booking using exactly the details shown below.',
    details: [
      { label: 'Room', value: 'Harlow Suite', key: 'location' },
      { label: 'Date', value: 'November 3, 2026', key: 'date' },
      { label: 'Start time', value: '10:30 AM', key: 'time' },
      { label: 'Attendees', value: '5', key: 'attendees' },
      { label: 'Room setup', value: 'Workshop', key: 'roomSetup' },
      { label: 'Reference', value: 'CONF-219', key: 'bookingRef' },
    ],
    expected: {
      location: 'Harlow Suite',
      date: 'November 3, 2026',
      time: '10:30 AM',
      attendees: '5',
      roomSetup: 'Workshop',
      bookingRef: 'CONF-219',
    },
  },
}

const EMPTY_FORM = {
  location: '',
  date: '',
  time: '',
  attendees: '',
  roomSetup: '',
  bookingRef: '',
}

export function countErrors(formData, expected) {
  return Object.keys(expected).filter((k) => {
    const v = (formData[k] || '').trim().toLowerCase()
    return v !== expected[k].toLowerCase()
  }).length
}

export function countActiveErrors(formData, expected) {
  return Object.keys(expected).filter((k) => {
    const v = (formData[k] || '').trim()
    if (!v) return false
    return v.toLowerCase() !== expected[k].toLowerCase()
  }).length
}

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
  const [phase, setPhase] = useState('idle')
  const [layout, setLayout] = useState('standard')
  const [eegMode, setEegMode] = useState('disconnected')
  const [guidedStep, setGuidedStep] = useState(0)
  const [adaptationTriggered, setAdaptationTriggered] = useState(false)
  const [formData, setFormData] = useState(EMPTY_FORM)
  const [startTime, setStartTime] = useState(null)
  const [elapsed, setElapsed] = useState(0)
  const [round1, setRound1] = useState(null)
  const [round2, setRound2] = useState(null)
  const [adaptedAtMs, setAdaptedAtMs] = useState(null)
  const [showAdaptMsg, setShowAdaptMsg] = useState(false)
  const [gazeEnabled, setGazeEnabled] = useState(false)
  const [apiKey, setApiKey] = useState('')

  useEffect(() => {
    if (phase !== 'round1' && phase !== 'round2') return
    const id = setInterval(() => setElapsed(Date.now() - startTime), 100)
    return () => clearInterval(id)
  }, [phase, startTime])

  function startRound1() {
    setFormData(EMPTY_FORM)
    setLayout('standard')
    setGuidedStep(0)
    setAdaptationTriggered(false)
    setAdaptedAtMs(null)
    const t = Date.now()
    setStartTime(t)
    setElapsed(0)
    setPhase('round1')
  }

  function submitRound1() {
    const dur = Date.now() - startTime
    setRound1({ duration: dur, errors: countErrors(formData, TASKS.round1.expected), formData: { ...formData } })
    setElapsed(0)
    setPhase('between')
  }

  function startRound2() {
    setFormData(EMPTY_FORM)
    setLayout('standard')
    setGuidedStep(0)
    setAdaptationTriggered(false)
    setAdaptedAtMs(null)
    const t = Date.now()
    setStartTime(t)
    setElapsed(0)
    setPhase('round2')
  }

  function triggerAdaptation() {
    if (adaptationTriggered) return
    const at = Date.now() - startTime
    setAdaptedAtMs(at)
    setAdaptationTriggered(true)
    setLayout('guided')
    setGuidedStep(0)
    setShowAdaptMsg(true)
    setTimeout(() => setShowAdaptMsg(false), 3500)
  }

  function submitRound2() {
    const dur = Date.now() - startTime
    setRound2({
      duration: dur,
      errors: countErrors(formData, TASKS.round2.expected),
      formData: { ...formData },
      layout: adaptationTriggered ? 'guided' : 'standard',
      adaptedAtMs,
    })
    setElapsed(0)
    setPhase('complete')
    setScreen('results')
  }

  function resetSession() {
    setPhase('idle')
    setFormData(EMPTY_FORM)
    setRound1(null)
    setRound2(null)
    setAdaptationTriggered(false)
    setAdaptedAtMs(null)
    setElapsed(0)
    setStartTime(null)
    setLayout('standard')
    setGuidedStep(0)
    setShowAdaptMsg(false)
    setScreen('study')
  }

  const currentTask = phase === 'round2' ? TASKS.round2 : TASKS.round1

  const ctx = {
    screen, setScreen,
    phase, layout,
    eegMode, setEegMode,
    gazeEnabled, setGazeEnabled,
    apiKey, setApiKey,
    guidedStep, setGuidedStep,
    adaptationTriggered,
    formData, setFormData,
    elapsed,
    round1, round2,
    adaptedAtMs,
    showAdaptMsg,
    currentTask,
    startRound1, submitRound1,
    startRound2, submitRound2,
    triggerAdaptation,
    resetSession,
  }

  return (
    <div className="flex h-screen bg-[#0d0d0d] text-white overflow-hidden">
      <Sidebar screen={screen} setScreen={setScreen} phase={phase} />
      <div className="flex flex-col flex-1 min-w-0">
        <TopBar phase={phase} eegMode={eegMode} onNewSession={resetSession} />
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
  )
}
