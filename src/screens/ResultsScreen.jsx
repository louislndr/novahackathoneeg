import { motion } from 'framer-motion'
import { Download, LayoutGrid, ArrowRight, Info, Clock, AlertCircle, CheckCircle2, Zap } from 'lucide-react'
import { formatMs, TASKS } from '../App'

function formatDurSec(ms) {
  if (ms == null) return '—'
  return `${(ms / 1000).toFixed(1)}s`
}

function MetricCard({ label, value, sub, accent }) {
  return (
    <div className={`panel-sm p-4 ${accent ? 'border-mint-500/20 bg-mint-500/[0.04]' : ''}`}>
      <p className="text-white/35 text-[10px] uppercase tracking-widest mb-1">{label}</p>
      <p className={`text-2xl font-mono font-light ${accent ? 'text-mint-500' : 'text-white'}`}>{value}</p>
      {sub && <p className="text-white/25 text-xs mt-0.5">{sub}</p>}
    </div>
  )
}

function RoundCard({ round, task, roundNum, adaptedAtMs }) {
  if (!round) {
    return (
      <div className="panel p-6 flex flex-col items-center justify-center h-40 text-white/20">
        <p className="text-sm">Round {roundNum} not completed</p>
      </div>
    )
  }

  const durationSec = (round.duration / 1000).toFixed(1)
  const isAdaptive = roundNum === 2

  return (
    <div className="panel p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <span className={`text-[10px] font-semibold uppercase tracking-widest ${isAdaptive ? 'text-mint-500' : 'text-yellow-400'}`}>
            Round {roundNum} · {isAdaptive ? 'Adaptive' : 'Baseline'}
          </span>
          <h3 className="text-[15px] font-semibold mt-0.5">{task.title}</h3>
        </div>
        <div className={`w-2 h-2 rounded-full ${round.errors === 0 ? 'bg-mint-500' : 'bg-red-400'}`} />
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <MetricCard label="Duration" value={`${durationSec}s`} sub={formatMs(round.duration)} />
        <MetricCard
          label="Errors on submit"
          value={round.errors}
          sub={round.errors === 0 ? 'All correct' : `${round.errors} field${round.errors > 1 ? 's' : ''} incorrect`}
          accent={round.errors === 0}
        />
      </div>

      <div className="space-y-2 mb-4">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-white/25 mb-2">Field-by-field</p>
        {Object.entries(task.expected).map(([key, expected]) => {
          const entered = (round.formData[key] || '').trim()
          const correct = entered.toLowerCase() === expected.toLowerCase()
          const fieldLabel = { location: 'Room', date: 'Date', time: 'Time', attendees: 'Attendees', roomSetup: 'Room Setup', bookingRef: 'Reference' }[key] || key

          return (
            <div key={key} className="flex items-center justify-between py-1.5 border-b border-white/[0.04] last:border-0">
              <span className="text-white/40 text-xs">{fieldLabel}</span>
              <div className="flex items-center gap-2">
                {!correct && entered && (
                  <span className="text-red-400/70 text-xs font-mono line-through">{entered}</span>
                )}
                <span className={`text-xs font-mono ${correct ? 'text-white/70' : 'text-mint-500/80'}`}>{expected}</span>
                {correct
                  ? <CheckCircle2 size={11} className="text-mint-500 flex-shrink-0" />
                  : <AlertCircle size={11} className="text-red-400 flex-shrink-0" />
                }
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        <span className={`text-[11px] px-2.5 py-1 rounded-full border font-medium ${
          round.layout === 'guided'
            ? 'bg-mint-500/10 text-mint-500 border-mint-500/25'
            : 'bg-white/[0.04] text-white/35 border-white/[0.08]'
        }`}>
          {round.layout === 'guided' ? 'Guided layout' : 'Standard layout'}
        </span>
        {isAdaptive && adaptedAtMs != null && (
          <span className="text-[11px] px-2.5 py-1 rounded-full border bg-mint-500/[0.06] text-mint-500/70 border-mint-500/15 font-medium">
            Adapted at +{formatMs(adaptedAtMs)}
          </span>
        )}
      </div>
    </div>
  )
}

function Timeline({ round1, round2, adaptedAtMs }) {
  const events = []

  if (round1) {
    events.push({ time: '00:00', label: 'Session started · Round 1 (Baseline)', color: 'text-yellow-400' })
    events.push({ time: formatMs(round1.duration), label: `Round 1 submitted · ${round1.errors} error${round1.errors !== 1 ? 's' : ''}`, color: 'text-white/50' })
  }
  if (round2) {
    events.push({ time: '—', label: 'Round 2 started (Adaptive)', color: 'text-mint-500' })
    if (adaptedAtMs != null) {
      events.push({ time: `+${formatMs(adaptedAtMs)}`, label: 'Layout adapted · Guided mode activated', color: 'text-mint-500' })
    }
    events.push({ time: formatMs(round2.duration), label: `Round 2 submitted · ${round2.errors} error${round2.errors !== 1 ? 's' : ''}`, color: 'text-white/50' })
  }

  return (
    <div className="panel p-5">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-white/30 mb-4">Session Timeline</p>
      <div className="space-y-3">
        {events.map((ev, i) => (
          <div key={i} className="flex items-start gap-3">
            <span className="text-[11px] font-mono text-white/25 w-14 flex-shrink-0 pt-0.5">{ev.time}</span>
            <div className="flex items-start gap-2.5 flex-1">
              <div className="flex flex-col items-center mt-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-white/20 flex-shrink-0" />
                {i < events.length - 1 && <div className="w-px h-4 bg-white/[0.06] mt-1" />}
              </div>
              <p className={`text-xs leading-relaxed ${ev.color}`}>{ev.label}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function download(round1, round2, adaptedAtMs) {
  const data = {
    session: {
      timestamp: new Date().toISOString(),
      eegNote: 'EEG data is simulated. These signals do not represent real brain activity.',
      pilotNote: 'Single-participant pilot. Practice effects and task familiarity may influence timing differences between rounds.',
    },
    round1: round1 ? {
      task: TASKS.round1.title,
      durationMs: round1.duration,
      durationFormatted: formatMs(round1.duration),
      errorsOnSubmit: round1.errors,
      layout: round1.layout,
      submitted: round1.formData,
      expected: TASKS.round1.expected,
    } : null,
    round2: round2 ? {
      task: TASKS.round2.title,
      durationMs: round2.duration,
      durationFormatted: formatMs(round2.duration),
      errorsOnSubmit: round2.errors,
      layout: round2.layout,
      adaptedAtMs,
      adaptedAtFormatted: adaptedAtMs != null ? formatMs(adaptedAtMs) : null,
      submitted: round2.formData,
      expected: TASKS.round2.expected,
    } : null,
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `frictionfix-session-${Date.now()}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export default function ResultsScreen({ round1, round2, adaptedAtMs, resetSession, setScreen }) {
  const hasData = round1 || round2

  if (!hasData) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <p className="text-white/30 text-sm mb-4">No session data yet.</p>
          <button onClick={() => setScreen('study')} className="btn-ghost">
            Go to Study
            <ArrowRight size={13} />
          </button>
        </div>
      </div>
    )
  }

  const container = {
    hidden: {},
    show: { transition: { staggerChildren: 0.08 } },
  }
  const item = {
    hidden: { opacity: 0, y: 12 },
    show: { opacity: 1, y: 0, transition: { duration: 0.25 } },
  }

  return (
    <div className="h-full overflow-auto p-5">
      <motion.div variants={container} initial="hidden" animate="show" className="max-w-4xl mx-auto space-y-5">
        {/* Header */}
        <motion.div variants={item} className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Session Results</h1>
            <p className="text-white/35 text-sm mt-0.5">Side-by-side comparison · {new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
          </div>
          <div className="flex gap-2">
            <motion.button
              onClick={() => download(round1, round2, adaptedAtMs)}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              className="btn-ghost"
            >
              <Download size={14} />
              Download JSON
            </motion.button>
            <motion.button
              onClick={resetSession}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              className="btn-ghost"
            >
              New session
            </motion.button>
          </div>
        </motion.div>

        {/* Summary comparison */}
        {round1 && round2 && (
          <motion.div variants={item} className="panel p-5">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-white/30 mb-4">Quick Comparison</p>
            <div className="grid grid-cols-4 gap-4">
              {[
                { label: 'R1 Duration', value: `${(round1.duration / 1000).toFixed(1)}s` },
                { label: 'R2 Duration', value: `${(round2.duration / 1000).toFixed(1)}s` },
                { label: 'R1 Errors', value: round1.errors },
                { label: 'R2 Errors', value: round2.errors },
              ].map(({ label, value }) => (
                <div key={label} className="text-center">
                  <p className="text-white/30 text-[10px] uppercase tracking-wide mb-1">{label}</p>
                  <p className="text-xl font-mono font-light">{value}</p>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Round cards */}
        <motion.div variants={item} className="grid grid-cols-2 gap-4">
          <RoundCard round={round1} task={TASKS.round1} roundNum={1} adaptedAtMs={null} />
          <RoundCard round={round2} task={TASKS.round2} roundNum={2} adaptedAtMs={adaptedAtMs} />
        </motion.div>

        {/* Timeline */}
        {(round1 || round2) && (
          <motion.div variants={item}>
            <Timeline round1={round1} round2={round2} adaptedAtMs={adaptedAtMs} />
          </motion.div>
        )}

        {/* Disclaimer */}
        <motion.div variants={item} className="panel-sm p-4 border border-white/[0.06] bg-white/[0.015]">
          <div className="flex items-start gap-2.5">
            <Info size={14} className="text-white/30 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-white/50 text-xs font-medium mb-1">About these results</p>
              <p className="text-white/25 text-xs leading-relaxed">
                This is a small pilot with a single participant completing one attempt per condition. Differences in timing may reflect task familiarity, practice effects, or natural variation — not solely the layout change. EEG signal data shown during the session was algorithmically simulated and does not represent real brain activity or confirm cognitive states.
              </p>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </div>
  )
}
