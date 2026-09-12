import { motion } from 'framer-motion'
import { Download, ArrowLeft, Sparkles, Brain, Globe, Clock, Info, AlertTriangle, Activity } from 'lucide-react'
import { formatMs } from '../App'

const EVIDENCE_LABELS = {
  long_gaze_dwell:    'Long gaze dwell',
  elevated_eeg_risk:  'High EEG load',
  rage_clicks:        'Rage clicks',
  repeated_clicks:    'Repeated clicks',
  scroll_reversals:   'Scroll reversals',
  backtrack:          'Backtrack navigation',
  input_error:        'Input error',
  inactivity:         'Prolonged inactivity',
}

const SEVERITY_STYLES = {
  low:    'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  medium: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  high:   'bg-red-500/10   text-red-400   border-red-500/20',
}

function download(suggestions, backendFrictionEvents, targetUrl) {
  const data = {
    generated: new Date().toISOString(),
    url: targetUrl,
    frictionEvents: backendFrictionEvents,
    aiSuggestions: suggestions.map(s => ({
      sessionTime: formatMs(s.sessionElapsed),
      eegLoad: s.eegLoad,
      element: s.elementLabel,
      suggestion: s.suggestion ?? s.text,
      coordinates: { x: s.x, y: s.y },
    })),
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `frictionfix-report-${Date.now()}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export default function ResultsScreen({ suggestions, backendFrictionEvents = [], targetUrl, setScreen, resetSession }) {
  const hasData = suggestions?.length > 0 || backendFrictionEvents.length > 0

  if (!hasData) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <p className="text-white/30 text-sm mb-4">No friction points recorded yet.</p>
          <button onClick={() => setScreen('study')} className="btn-ghost">
            <ArrowLeft size={13} />
            Back to study
          </button>
        </div>
      </div>
    )
  }

  const container = { hidden: {}, show: { transition: { staggerChildren: 0.07 } } }
  const item = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.22 } } }

  const highSeverity = backendFrictionEvents.filter(e => e.severity === 'high').length
  const highLoadCount = suggestions.filter(s => s.eegLoad >= 70).length
  const totalFriction = backendFrictionEvents.length + suggestions.length

  return (
    <div className="h-full overflow-auto p-5">
      <motion.div variants={container} initial="hidden" animate="show" className="max-w-3xl mx-auto space-y-5">

        {/* Header */}
        <motion.div variants={item} className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold font-display">Friction Report</h1>
            <div className="flex items-center gap-2 mt-1">
              <Globe size={12} className="text-white/30" />
              <span className="text-white/35 text-sm truncate max-w-sm">{targetUrl || '—'}</span>
            </div>
          </div>
          <div className="flex gap-2">
            <motion.button
              onClick={() => download(suggestions, backendFrictionEvents, targetUrl)}
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
              className="btn-ghost"
            >
              <Download size={13} />
              Export JSON
            </motion.button>
            <motion.button
              onClick={resetSession}
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
              className="btn-ghost"
            >
              New session
            </motion.button>
          </div>
        </motion.div>

        {/* Summary */}
        <motion.div variants={item} className="grid grid-cols-3 gap-4">
          {[
            { label: 'Total friction points', value: totalFriction },
            {
              label: backendFrictionEvents.length > 0 ? 'High-severity events' : 'High-load triggers',
              value: backendFrictionEvents.length > 0 ? highSeverity : highLoadCount,
              accent: (backendFrictionEvents.length > 0 ? highSeverity : highLoadCount) > 0,
            },
            {
              label: suggestions.length > 0 ? 'Avg EEG load' : 'Backend events',
              value: suggestions.length > 0
                ? `${Math.round(suggestions.reduce((a, s) => a + s.eegLoad, 0) / suggestions.length)}/100`
                : backendFrictionEvents.length,
            },
          ].map(({ label, value, accent }) => (
            <div key={label} className="panel p-5 text-center">
              <p className="text-white/35 text-[11px] mb-1">{label}</p>
              <p className={`text-2xl font-light ${accent ? 'text-red-400' : 'text-white'}`}>{value}</p>
            </div>
          ))}
        </motion.div>

        {/* Backend friction events */}
        {backendFrictionEvents.length > 0 && (
          <motion.div variants={item}>
            <div className="flex items-center gap-2 mb-3">
              <Activity size={12} className="text-mint-500" />
              <p className="text-xs font-medium text-white/35">Backend friction events</p>
            </div>
            <div className="space-y-3">
              {backendFrictionEvents.map((e, i) => (
                <motion.div key={e.friction_event_id ?? i} variants={item} className="panel p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-mint-500/10 border border-mint-500/20 flex items-center justify-center flex-shrink-0">
                        <span className="text-[10px] text-mint-500">{i + 1}</span>
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-medium text-white/70">
                            {e.element_id || 'Page region'}
                          </span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded border capitalize ${SEVERITY_STYLES[e.severity] || SEVERITY_STYLES.medium}`}>
                            {e.severity}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.05] text-white/30 border border-white/[0.06]">
                            score {Math.round(e.friction_score * 100)}%
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {(e.evidence || []).map(ev => (
                            <span key={ev} className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.04] text-white/25 border border-white/[0.06]">
                              {EVIDENCE_LABELS[ev] ?? ev}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <AlertTriangle size={13} className="text-orange-400/60 flex-shrink-0" />
                  </div>

                  {e.suggestion && (
                    <div className="bg-mint-500/[0.05] border border-mint-500/15 rounded-lg p-4 space-y-1.5">
                      <p className="text-[10px] text-mint-500/60 font-medium uppercase tracking-wide">
                        {e.suggestion.priority} priority · {e.suggestion.problem}
                      </p>
                      <p className="text-white/80 text-sm leading-relaxed">{e.suggestion.suggestion}</p>
                      {e.suggestion.rationale && (
                        <p className="text-white/30 text-xs leading-relaxed">{e.suggestion.rationale}</p>
                      )}
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Claude AI suggestions */}
        {suggestions?.length > 0 && (
          <motion.div variants={item}>
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={12} className="text-violet-400" />
              <p className="text-xs font-medium text-white/35">AI suggestions</p>
            </div>
            <div className="space-y-3">
              {suggestions.map((s, i) => (
                <motion.div key={s.id ?? i} variants={item} className="panel p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-violet-500/10 border border-violet-500/20 flex items-center justify-center flex-shrink-0">
                        <span className="text-[10px] text-violet-400">{i + 1}</span>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-white/70">
                            {s.elementLabel && s.elementLabel !== 'unknown element'
                              ? s.elementLabel
                              : 'Page region'}
                          </span>
                          {s.eegLoad >= 70 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-400/10 text-red-400 border border-red-400/20">
                              High load
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-[10px] text-white/25 flex items-center gap-1">
                            <Clock size={8} />
                            {formatMs(s.sessionElapsed)}
                          </span>
                          <span className="text-[10px] text-white/25 flex items-center gap-1">
                            <Brain size={8} />
                            EEG {s.eegLoad}/100
                          </span>
                        </div>
                      </div>
                    </div>
                    <Sparkles size={13} className="text-violet-400/60 flex-shrink-0" />
                  </div>

                  <div className="bg-violet-500/[0.06] border border-violet-500/15 rounded-lg p-4">
                    <p className="text-white/80 text-sm leading-relaxed">{s.suggestion ?? s.text}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Disclaimer */}
        <motion.div variants={item} className="panel-sm p-4">
          <div className="flex items-start gap-2.5">
            <Info size={13} className="text-white/25 flex-shrink-0 mt-0.5" />
            <p className="text-white/25 text-xs leading-relaxed">
              EEG signals are algorithmically simulated unless a live ANT Neuro device is connected. Eye tracking is approximate (webcam-based, WebGazer.js). AI suggestions are generated by Claude. This is a research prototype — treat findings as hypotheses to validate.
            </p>
          </div>
        </motion.div>

      </motion.div>
    </div>
  )
}
