import { motion } from 'framer-motion'
import { Download, ArrowLeft, Sparkles, Brain, Globe, Clock, Info } from 'lucide-react'
import { formatMs } from '../App'

function download(suggestions, targetUrl) {
  const data = {
    generated: new Date().toISOString(),
    url: targetUrl,
    note: 'EEG data is simulated. Eye tracking is webcam-based (WebGazer.js). Results are for demonstration purposes only.',
    frictionPoints: suggestions.map(s => ({
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

export default function ResultsScreen({ suggestions, targetUrl, setScreen, resetSession }) {
  if (!suggestions || suggestions.length === 0) {
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

  const highLoadCount = suggestions.filter(s => s.eegLoad >= 70).length

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
              onClick={() => download(suggestions, targetUrl)}
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
        <motion.div variants={item} className="grid grid-cols-3 gap-3">
          {[
            { label: 'Friction points', value: suggestions.length },
            { label: 'High-load triggers', value: highLoadCount, accent: highLoadCount > 0 },
            { label: 'Avg EEG load', value: `${Math.round(suggestions.reduce((a, s) => a + s.eegLoad, 0) / suggestions.length)}/100` },
          ].map(({ label, value, accent }) => (
            <div key={label} className="panel p-4 text-center">
              <p className="text-white/35 text-[11px] mb-1">{label}</p>
              <p className={`text-2xl font-light ${accent ? 'text-red-400' : 'text-white'}`}>{value}</p>
            </div>
          ))}
        </motion.div>

        {/* Friction points */}
        <motion.div variants={item}>
          <p className="text-xs font-medium text-white/35 mb-3">Detected friction points</p>
          <div className="space-y-3">
            {suggestions.map((s, i) => (
              <motion.div
                key={s.id ?? i}
                variants={item}
                className="panel p-5"
              >
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

                <div className="bg-violet-500/[0.06] border border-violet-500/15 rounded-lg p-3.5">
                  <p className="text-white/80 text-sm leading-relaxed">{s.suggestion ?? s.text}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Disclaimer */}
        <motion.div variants={item} className="panel-sm p-4">
          <div className="flex items-start gap-2.5">
            <Info size={13} className="text-white/25 flex-shrink-0 mt-0.5" />
            <p className="text-white/25 text-xs leading-relaxed">
              EEG signals are algorithmically simulated and do not reflect real brain activity. Eye tracking is approximate (webcam-based, WebGazer.js). Suggestions are generated by Claude AI based on element context and gaze position. This is a research prototype — treat findings as hypotheses to validate.
            </p>
          </div>
        </motion.div>

      </motion.div>
    </div>
  )
}
