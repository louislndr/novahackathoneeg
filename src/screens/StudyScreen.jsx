import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, Check, Play, ArrowRight, ArrowLeft, Zap, Clock, AlertCircle, LayoutGrid, ArrowRightCircle, CheckCircle2 } from 'lucide-react'
import EEGWave from '../components/EEGWave'
import GazeTracker from '../components/GazeTracker'
import { countActiveErrors, formatMsLive } from '../App'

const FORM_FIELDS = [
  {
    key: 'location',
    label: 'Meeting Room',
    placeholder: 'Select a room',
    type: 'select',
    options: ['Pinecrest Boardroom', 'Harlow Suite', 'Cedar Room', 'Birchwood Hall', 'Maple Conference', 'Oak Executive'],
  },
  {
    key: 'date',
    label: 'Date',
    placeholder: 'Select a date',
    type: 'select',
    options: ['October 12, 2026', 'October 14, 2026', 'October 16, 2026', 'November 1, 2026', 'November 3, 2026', 'November 5, 2026'],
  },
  {
    key: 'time',
    label: 'Start Time',
    placeholder: 'Select a time',
    type: 'select',
    options: ['8:00 AM', '8:30 AM', '9:00 AM', '9:30 AM', '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM', '12:00 PM', '1:00 PM', '1:30 PM', '2:00 PM', '2:30 PM', '3:00 PM', '3:30 PM', '4:00 PM', '4:30 PM', '5:00 PM'],
  },
  {
    key: 'attendees',
    label: 'Number of Attendees',
    placeholder: 'e.g. 8',
    type: 'number',
  },
  {
    key: 'roomSetup',
    label: 'Room Setup',
    placeholder: 'Select a setup',
    type: 'select',
    options: ['Theater', 'Workshop', 'Boardroom', 'Classroom', 'U-Shape', 'Reception'],
  },
  {
    key: 'bookingRef',
    label: 'Booking Reference',
    placeholder: 'e.g. MTNG-447',
    type: 'text',
  },
]

function FieldInput({ field, value, onChange, large }) {
  const base = [
    'input-base',
    large ? 'text-lg py-3.5 px-4' : '',
  ].join(' ')

  if (field.type === 'select') {
    return (
      <div className="relative">
        <select value={value} onChange={(e) => onChange(e.target.value)} className={base}>
          <option value="">{field.placeholder}</option>
          {field.options.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
      </div>
    )
  }

  return (
    <input
      type={field.type === 'number' ? 'number' : 'text'}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.placeholder}
      className={base}
      min={field.type === 'number' ? 1 : undefined}
      max={field.type === 'number' ? 50 : undefined}
    />
  )
}

function TaskCard({ task, phase }) {
  const running = phase === 'round1' || phase === 'round2'

  return (
    <motion.div
      layout
      className="panel p-5"
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-widest text-mint-500">
            {task.roundLabel}
          </span>
          <h2 className="text-[17px] font-semibold text-white mt-0.5">{task.title}</h2>
        </div>
        {running && (
          <motion.span
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ repeat: Infinity, duration: 1.6 }}
            className="w-2 h-2 rounded-full bg-mint-500 mt-1 flex-shrink-0"
          />
        )}
      </div>

      <p className="text-white/40 text-sm mb-4 leading-relaxed">{task.instruction}</p>

      <div className="grid grid-cols-3 gap-2">
        {task.details.map(({ label, value }) => (
          <div key={label} className="bg-[#111111] border border-white/[0.05] rounded-lg p-3">
            <p className="text-white/35 text-[10px] uppercase tracking-wide mb-1">{label}</p>
            <p className="text-white text-[13px] font-mono font-medium leading-tight">{value}</p>
          </div>
        ))}
      </div>
    </motion.div>
  )
}

function StandardForm({ formData, onChange, onSubmit, phase, adaptationTriggered, triggerAdaptation, showAdaptMsg }) {
  return (
    <motion.div key="standard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: 0.25 }}>
      <AnimatePresence>
        {showAdaptMsg && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-2.5 px-4 py-3 mb-4 rounded-lg bg-mint-500/10 border border-mint-500/20"
          >
            <ArrowRightCircle size={15} className="text-mint-500 flex-shrink-0" />
            <span className="text-mint-500 text-sm font-medium">Let's take this one step at a time.</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-2 gap-3.5">
        {FORM_FIELDS.map((field, i) => (
          <motion.div
            key={field.key}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04, duration: 0.2 }}
          >
            <label className="block text-[11px] font-medium text-white/40 uppercase tracking-wide mb-1.5">
              {field.label}
            </label>
            <FieldInput field={field} value={formData[field.key]} onChange={(v) => onChange(field.key, v)} />
          </motion.div>
        ))}
      </div>

      <div className="flex items-center justify-between mt-5 pt-5 border-t border-white/[0.05]">
        {phase === 'round2' && !adaptationTriggered ? (
          <motion.button
            onClick={triggerAdaptation}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            className="flex items-center gap-1.5 text-[13px] font-medium px-3.5 py-2 rounded-lg border border-mint-500/30 text-mint-500/80 hover:text-mint-500 hover:bg-mint-500/5 transition-colors"
          >
            <Zap size={13} />
            Trigger adaptation
          </motion.button>
        ) : (
          <div />
        )}
        <motion.button
          onClick={onSubmit}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          className="btn-mint"
        >
          Submit booking
          <ArrowRight size={14} />
        </motion.button>
      </div>
    </motion.div>
  )
}

function GuidedForm({ formData, onChange, onSubmit, guidedStep, setGuidedStep, showAdaptMsg }) {
  const field = FORM_FIELDS[guidedStep]
  const total = FORM_FIELDS.length
  const isLast = guidedStep === total - 1
  const completedFields = FORM_FIELDS.slice(0, guidedStep)

  return (
    <motion.div key="guided" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
      <AnimatePresence>
        {showAdaptMsg && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-2.5 px-4 py-3 mb-5 rounded-lg bg-mint-500/10 border border-mint-500/20"
          >
            <ArrowRightCircle size={15} className="text-mint-500 flex-shrink-0" />
            <span className="text-mint-500 text-sm font-medium">Let's take this one step at a time.</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Progress bar */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-white/40 text-xs">
            Step {guidedStep + 1} of {total}
          </span>
          <span className="text-white/30 text-xs">{field.label}</span>
        </div>
        <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-mint-500 rounded-full"
            animate={{ width: `${((guidedStep + 1) / total) * 100}%` }}
            transition={{ duration: 0.35, ease: 'easeInOut' }}
          />
        </div>
        <div className="flex gap-1 mt-2">
          {FORM_FIELDS.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                i < guidedStep ? 'bg-mint-500' : i === guidedStep ? 'bg-mint-500/50' : 'bg-white/[0.06]'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Current field */}
      <AnimatePresence mode="wait">
        <motion.div
          key={guidedStep}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          className="mb-6"
        >
          <label className="block text-white/60 text-sm font-medium mb-3">{field.label}</label>
          <FieldInput field={field} value={formData[field.key]} onChange={(v) => onChange(field.key, v)} large />
        </motion.div>
      </AnimatePresence>

      {/* Completed fields */}
      {completedFields.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          {completedFields.map((f) => (
            <div
              key={f.key}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-mint-500/[0.07] border border-mint-500/20 rounded-lg text-xs"
            >
              <Check size={10} className="text-mint-500 flex-shrink-0" />
              <span className="text-white/40">{f.label}:</span>
              <span className="text-white/70 font-mono">{formData[f.key] || '—'}</span>
            </div>
          ))}
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between pt-4 border-t border-white/[0.05]">
        <motion.button
          onClick={() => setGuidedStep((s) => Math.max(0, s - 1))}
          disabled={guidedStep === 0}
          whileHover={guidedStep > 0 ? { scale: 1.02 } : {}}
          whileTap={guidedStep > 0 ? { scale: 0.97 } : {}}
          className="btn-ghost"
        >
          <ArrowLeft size={14} />
          Previous
        </motion.button>

        {isLast ? (
          <motion.button
            onClick={onSubmit}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            className="btn-mint"
          >
            Submit booking
            <ArrowRight size={14} />
          </motion.button>
        ) : (
          <motion.button
            onClick={() => setGuidedStep((s) => Math.min(total - 1, s + 1))}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            className="btn-mint"
          >
            Next
            <ArrowRight size={14} />
          </motion.button>
        )}
      </div>
    </motion.div>
  )
}

function BookingFormPanel(props) {
  const { layout, formData, setFormData, guidedStep, setGuidedStep, phase, onSubmit, adaptationTriggered, triggerAdaptation, showAdaptMsg } = props

  function onChange(key, value) {
    setFormData((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div className="panel overflow-hidden">
      <div className="px-5 py-4 border-b border-white/[0.05] flex items-center justify-between">
        <div>
          <h3 className="text-[15px] font-semibold">Room Booking Form</h3>
          <p className="text-white/35 text-xs mt-0.5">Complete all fields to submit your booking</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[11px] px-2 py-1 rounded-full font-medium border ${
            layout === 'guided'
              ? 'bg-mint-500/10 text-mint-500 border-mint-500/25'
              : 'bg-white/[0.04] text-white/35 border-white/[0.06]'
          }`}>
            {layout === 'guided' ? 'Guided' : 'Standard'}
          </span>
        </div>
      </div>

      <div className="p-5">
        <AnimatePresence mode="wait">
          {layout === 'standard' ? (
            <StandardForm
              key="standard"
              formData={formData}
              onChange={onChange}
              onSubmit={onSubmit}
              phase={phase}
              adaptationTriggered={adaptationTriggered}
              triggerAdaptation={triggerAdaptation}
              showAdaptMsg={showAdaptMsg}
            />
          ) : (
            <GuidedForm
              key="guided"
              formData={formData}
              onChange={onChange}
              onSubmit={onSubmit}
              guidedStep={guidedStep}
              setGuidedStep={setGuidedStep}
              showAdaptMsg={showAdaptMsg}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

function ResearchPanel({ elapsed, phase, layout, eegMode, formData, currentTask, adaptationTriggered, triggerAdaptation, adaptedAtMs, setScreen }) {
  const running = phase === 'round1' || phase === 'round2'
  const liveErrors = running ? countActiveErrors(formData, currentTask.expected) : 0

  return (
    <div className="w-64 flex-shrink-0 flex flex-col gap-3 overflow-auto">
      {/* Timer */}
      <div className="panel p-4">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-2 flex items-center gap-1.5">
          <Clock size={10} />
          Elapsed Time
        </p>
        <p className={`text-3xl font-mono font-light tracking-tight ${running ? 'text-white' : 'text-white/20'}`}>
          {running ? formatMsLive(elapsed) : '—:——.—'}
        </p>
      </div>

      {/* Live metrics */}
      <div className="panel p-4 space-y-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30">Metrics</p>

        <div className="flex items-center justify-between">
          <span className="text-white/50 text-xs">Active errors</span>
          <span className={`text-xs font-mono font-semibold tabular-nums ${liveErrors > 0 ? 'text-red-400' : 'text-white/20'}`}>
            {running ? liveErrors : '—'}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-white/50 text-xs">Layout</span>
          <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
            layout === 'guided'
              ? 'bg-mint-500/10 text-mint-500'
              : 'bg-white/[0.04] text-white/30'
          }`}>
            {layout === 'guided' ? 'Guided' : 'Standard'}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-white/50 text-xs">Signal</span>
          <span className={`text-xs font-medium ${
            eegMode === 'simulated' ? 'text-yellow-400' : 'text-white/20'
          }`}>
            {eegMode === 'simulated' ? 'Simulated' : 'Disconnected'}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-white/50 text-xs">Phase</span>
          <span className="text-white/30 text-xs font-mono">
            {phase === 'idle' ? '—' : phase === 'round1' ? 'Baseline' : phase === 'round2' ? 'Adaptive' : phase}
          </span>
        </div>
      </div>

      {/* EEG preview */}
      {eegMode === 'simulated' && (
        <div className="panel p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30">EEG Preview</p>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-400 border border-yellow-500/15 font-semibold">
              SIM
            </span>
          </div>
          <div className="bg-[#0f0f0f] rounded-lg overflow-hidden">
            <EEGWave active={true} hasError={liveErrors > 0} height={64} channelIndex={0} />
          </div>
          <p className="text-[10px] text-white/15 mt-2 text-center">Simulated EEG — not real brain data</p>
        </div>
      )}

      {/* Researcher controls */}
      {phase === 'round2' && !adaptationTriggered && (
        <div className="panel p-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-3">Researcher Controls</p>
          <motion.button
            onClick={triggerAdaptation}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-[13px] font-medium border border-mint-500/30 text-mint-500 hover:bg-mint-500/5 transition-colors"
          >
            <Zap size={13} />
            Trigger Adaptation
          </motion.button>
          <p className="text-white/20 text-[10px] mt-2 text-center">Switches form to guided layout</p>
        </div>
      )}

      {adaptationTriggered && adaptedAtMs != null && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="panel-sm p-3 border border-mint-500/20 bg-mint-500/[0.04] flex items-center gap-2"
        >
          <CheckCircle2 size={13} className="text-mint-500 flex-shrink-0" />
          <div>
            <p className="text-mint-500 text-xs font-medium">Adaptation active</p>
            <p className="text-white/30 text-[10px] mt-0.5">Triggered at {formatMsLive(adaptedAtMs)}</p>
          </div>
        </motion.div>
      )}
    </div>
  )
}

function IdleState({ onStart }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="panel p-10 flex flex-col items-center text-center"
    >
      <div className="w-14 h-14 rounded-2xl bg-mint-500/10 border border-mint-500/20 flex items-center justify-center mb-5">
        <Play size={22} className="text-mint-500 ml-0.5" />
      </div>
      <h3 className="text-xl font-semibold mb-2">Ready to begin</h3>
      <p className="text-white/35 text-sm leading-relaxed max-w-sm mb-7">
        This session runs two equivalent booking tasks. Round 1 uses the standard form. Round 2 can be adapted mid-task to the guided layout.
      </p>
      <motion.button
        onClick={onStart}
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
        className="btn-mint text-base px-7 py-3"
      >
        <Play size={15} />
        Start test
      </motion.button>
      <p className="text-white/20 text-xs mt-4">Round 1 · Baseline · Standard layout</p>
    </motion.div>
  )
}

function BetweenRoundsCard({ round1, onStart }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      className="panel p-8 flex flex-col items-center text-center"
    >
      <div className="w-12 h-12 rounded-2xl bg-mint-500/10 border border-mint-500/20 flex items-center justify-center mb-4">
        <CheckCircle2 size={20} className="text-mint-500" />
      </div>
      <h3 className="text-lg font-semibold mb-1">Round 1 complete</h3>
      <p className="text-white/40 text-sm mb-6">Review your baseline results before starting the adaptive round.</p>

      <div className="flex gap-6 mb-7">
        <div className="text-center">
          <p className="text-2xl font-mono font-light">{round1?.errors ?? 0}</p>
          <p className="text-white/35 text-xs mt-0.5">Errors</p>
        </div>
        <div className="w-px bg-white/[0.06]" />
        <div className="text-center">
          <p className="text-2xl font-mono font-light">{round1 ? formatDur(round1.duration) : '—'}</p>
          <p className="text-white/35 text-xs mt-0.5">Duration</p>
        </div>
      </div>

      <motion.button
        onClick={onStart}
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
        className="btn-mint"
      >
        Start Round 2
        <ArrowRight size={14} />
      </motion.button>
      <p className="text-white/20 text-xs mt-3">Round 2 · Adaptive · Researcher can trigger layout change</p>
    </motion.div>
  )
}

function formatDur(ms) {
  if (!ms) return '—'
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  return `${m}:${(s % 60).toString().padStart(2, '0')}`
}

function CompleteCard({ setScreen }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="panel p-8 flex flex-col items-center text-center"
    >
      <div className="w-12 h-12 rounded-2xl bg-mint-500/10 border border-mint-500/20 flex items-center justify-center mb-4">
        <LayoutGrid size={18} className="text-mint-500" />
      </div>
      <h3 className="text-lg font-semibold mb-1">Session complete</h3>
      <p className="text-white/40 text-sm mb-5">Both rounds finished. View your results.</p>
      <motion.button
        onClick={() => setScreen('results')}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.97 }}
        className="btn-mint"
      >
        View results
        <ArrowRight size={14} />
      </motion.button>
    </motion.div>
  )
}

export default function StudyScreen(props) {
  const {
    phase, layout, eegMode,
    guidedStep, setGuidedStep,
    adaptationTriggered, formData, setFormData,
    elapsed, adaptedAtMs, showAdaptMsg,
    currentTask,
    startRound1, submitRound1, startRound2, submitRound2,
    triggerAdaptation,
    round1,
    setScreen,
    gazeEnabled, apiKey,
  } = props

  const onSubmit = phase === 'round1' ? submitRound1 : submitRound2
  const running = phase === 'round1' || phase === 'round2'

  return (
    <div className="h-full flex gap-5 p-5 overflow-hidden">
      <GazeTracker
        enabled={gazeEnabled}
        phase={phase}
        formData={formData}
        currentTask={currentTask}
        apiKey={apiKey}
        eegMode={eegMode}
        elapsed={elapsed}
      />
      {/* Left column */}
      <div className="flex-1 flex flex-col gap-4 min-w-0 overflow-auto">
        <AnimatePresence mode="wait">
          {(running || phase === 'idle' || phase === 'between' || phase === 'complete') && (
            <motion.div key="task" layout className="flex-shrink-0">
              <TaskCard task={currentTask} phase={phase} />
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {phase === 'idle' && (
            <motion.div key="idle" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <IdleState onStart={startRound1} />
            </motion.div>
          )}

          {running && (
            <motion.div key={`form-${phase}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <BookingFormPanel
                layout={layout}
                formData={formData}
                setFormData={setFormData}
                guidedStep={guidedStep}
                setGuidedStep={setGuidedStep}
                phase={phase}
                onSubmit={onSubmit}
                adaptationTriggered={adaptationTriggered}
                triggerAdaptation={triggerAdaptation}
                showAdaptMsg={showAdaptMsg}
              />
            </motion.div>
          )}

          {phase === 'between' && (
            <motion.div key="between" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <BetweenRoundsCard round1={round1} onStart={startRound2} />
            </motion.div>
          )}

          {phase === 'complete' && (
            <motion.div key="complete" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <CompleteCard setScreen={setScreen} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Right panel */}
      <ResearchPanel
        elapsed={elapsed}
        phase={phase}
        layout={layout}
        eegMode={eegMode}
        formData={formData}
        currentTask={currentTask}
        adaptationTriggered={adaptationTriggered}
        triggerAdaptation={triggerAdaptation}
        adaptedAtMs={adaptedAtMs}
        setScreen={setScreen}
      />
    </div>
  )
}
