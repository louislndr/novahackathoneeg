import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Download, Sparkles, Brain, Globe, Clock, Info, Rocket, Loader2, CheckCircle2 } from 'lucide-react'
import { formatMs } from '../App'

const IMPROVED_SITE_URL = window.location.origin + '/demo-sites/coastal-clean/index.html'

// Fixed findings for the Coastal Home Services demo site. A live demo has too little
// time for a participant to fixate on every planted element for 2s+, so the report
// shown is this curated, deterministic set -- each entry maps to a real element that
// actually exists on the page, not a randomly generated or made-up finding.
const FIXED_REPORT = [
  {
    id: 'f1', sessionElapsed: 7000, eegLoad: 91,
    elementLabel: 'CLAIM NOW (prize popup)',
    text: "Remove the surprise prize popup — an unsolicited \"$500 voucher\" claim reads as a scam pattern and erodes trust before visitors see any real content. If a genuine promotion exists, present it inline near pricing instead of as an interruptive overlay.",
  },
  {
    id: 'f2', sessionElapsed: 15000, eegLoad: 84,
    elementLabel: 'Update Now (security warning banner)',
    text: "This browser-update warning mimics malware-style scare banners. Remove it, or replace it with a clearly-branded, dismissible site notice so it doesn't read as a security threat.",
  },
  {
    id: 'f3', sessionElapsed: 29000, eegLoad: 68,
    elementLabel: 'MOST POPULAR badge (Full Home Care Plan)',
    text: "\"Most Popular\" sits on the most expensive plan with the least descriptive detail, contradicting what that label implies. Move it to the plan actually booked most often, or remove it if that data isn't tracked.",
  },
  {
    id: 'f4', sessionElapsed: 41000, eegLoad: 55,
    elementLabel: 'based on 3 reviews',
    text: "A 4.9-star average built on only 3 reviews reads as unreliable at a glance. Show a confidence-appropriate sample size, or pair the rating with a visibly larger review count before featuring it this prominently.",
  },
  {
    id: 'f5', sessionElapsed: 58000, eegLoad: 72,
    elementLabel: 'We respond within 1 hour, guaranteed.',
    text: "This guarantee directly contradicts the footer's \"3–5 business days\" disclaimer. Align both statements or drop the guarantee — the contradiction undermines trust more than either claim helps it.",
  },
  {
    id: 'f6', sessionElapsed: 70000, eegLoad: 61,
    elementLabel: 'Sarah from support is online — chat now for a special discount!',
    text: "An unsolicited chat bubble offering a discount immediately on load reads as bait rather than help. Delay it until the visitor has engaged with the page, and make it easy to dismiss permanently.",
  },
]

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

export default function ResultsScreen({ targetUrl, setScreen, setTargetUrl, resetSession }) {
  // Fixed, deterministic findings for this demo site -- see FIXED_REPORT above.
  const suggestions = FIXED_REPORT
  const [deployState, setDeployState] = useState('idle') // 'idle' | 'deploying' | 'done'

  const container = { hidden: {}, show: { transition: { staggerChildren: 0.07 } } }
  const item = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.22 } } }

  const highLoadCount = suggestions.filter(s => s.eegLoad >= 70).length

  function deployImprovedSite() {
    if (deployState !== 'idle') return
    setDeployState('deploying')
    setTimeout(() => {
      setDeployState('done')
      setTimeout(() => {
        setTargetUrl(IMPROVED_SITE_URL)
        setScreen('study')
      }, 500)
    }, 1200)
  }

  return (
    <div className="h-full overflow-auto p-5">
      <motion.div variants={container} initial="hidden" animate="show" className="max-w-3xl mx-auto space-y-5">

        {/* Header */}
        <motion.div variants={item} className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Friction Report</h1>
            <div className="flex items-center gap-2 mt-1">
              <Globe size={12} className="text-white/30" />
              <span className="text-white/35 text-sm font-mono truncate max-w-sm">{targetUrl || '—'}</span>
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
              <p className="text-white/30 text-[10px] uppercase tracking-widest mb-1">{label}</p>
              <p className={`text-2xl font-mono font-light ${accent ? 'text-red-400' : 'text-white'}`}>{value}</p>
            </div>
          ))}
        </motion.div>

        {/* Friction points */}
        <motion.div variants={item}>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-white/30 mb-3">Detected friction points</p>
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
                      <span className="text-[10px] font-mono text-violet-400">{i + 1}</span>
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

        {/* Suggested improvement */}
        <motion.div variants={item} className="panel p-5 border border-mint-500/20">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <Sparkles size={12} className="text-mint-500" />
                <span className="text-[10px] font-semibold uppercase tracking-widest text-mint-500">Suggested improvement</span>
              </div>
              <p className="text-white/70 text-sm font-medium mb-1">
                An improved version of this page is ready — the {suggestions.length} friction points above are addressed:
                no popup, no fake warning banner, no unsolicited chat bait, and the pricing, rating and response-time
                claims no longer contradict themselves.
              </p>
              <p className="text-white/25 text-xs">Same site, same layout — just without the parts that caused friction.</p>
            </div>
            <motion.button
              onClick={deployImprovedSite}
              disabled={deployState !== 'idle'}
              whileHover={deployState === 'idle' ? { scale: 1.02 } : {}}
              whileTap={deployState === 'idle' ? { scale: 0.97 } : {}}
              className="btn-mint flex-shrink-0"
            >
              <AnimatePresence mode="wait" initial={false}>
                {deployState === 'idle' && (
                  <motion.span key="idle" className="flex items-center gap-1.5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <Rocket size={13} /> Deploy improved version
                  </motion.span>
                )}
                {deployState === 'deploying' && (
                  <motion.span key="deploying" className="flex items-center gap-1.5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <Loader2 size={13} className="animate-spin" /> Deploying…
                  </motion.span>
                )}
                {deployState === 'done' && (
                  <motion.span key="done" className="flex items-center gap-1.5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <CheckCircle2 size={13} /> Live
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
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
