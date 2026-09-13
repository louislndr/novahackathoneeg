import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Download, ArrowLeft, Sparkles, Brain, Globe, Clock, AlertTriangle, Activity, Loader2, TrendingDown, Rocket, CheckCircle2 } from 'lucide-react'
import { formatMs } from '../App'

const DEMO_SITE_URL = window.location.origin + '/demo-sites/nimbus-pricing/index.html'
const IMPROVED_SITE_URL = window.location.origin + '/demo-sites/coastal-clean/index.html'

// Deterministic findings for the Coastal Home Services demo — each entry maps to a
// real planted element on the page. Live sessions rarely fixate long enough on every
// element, so this curated set is shown when that URL is the session target.
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

const EEG_EVENT_META = {
  cognitive_overload: {
    label: 'Cognitive Overload',
    sub:   'Sustained high cognitive load — user processing was over-taxed',
    Icon:  Brain,
    card:  'border-red-400/15 bg-red-400/[0.04]',
  },
  disengagement: {
    label: 'Disengagement',
    sub:   'Engagement index dropped below threshold',
    Icon:  TrendingDown,
    card:  'border-yellow-500/15 bg-yellow-500/[0.03]',
  },
}

function download(suggestions, backendFrictionEvents, eegFrictionEvents, eegSessionMetrics, targetUrl) {
  const data = {
    generated: new Date().toISOString(),
    url: targetUrl,
    eegMetrics: eegSessionMetrics,
    eegFrictionEvents,
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

export default function ResultsScreen({
  suggestions: liveSuggestions, backendFrictionEvents = [], targetUrl, setTargetUrl, setScreen, resetSession,
  eegFrictionEvents = [], eegSessionMetrics, aiReport, isGeneratingReport,
}) {
  const [deployState, setDeployState] = useState('idle') // 'idle' | 'deploying' | 'done'

  // When the Coastal Home Services demo is the session target, override live suggestions
  // with the curated fixed report. All other URLs use the real live data as normal.
  const isDemoSite = targetUrl === DEMO_SITE_URL
  const suggestions = isDemoSite ? FIXED_REPORT : (liveSuggestions ?? [])

  const hasData = suggestions.length > 0
    || backendFrictionEvents.length > 0
    || eegFrictionEvents.length > 0
    || eegSessionMetrics != null

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

  if (!hasData) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <p className="text-white/30 text-sm mb-4">No data recorded yet. Run a session first.</p>
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
  const totalFriction = backendFrictionEvents.length + suggestions.length + eegFrictionEvents.length

  return (
    <div className="h-full overflow-auto p-5">
      <motion.div variants={container} initial="hidden" animate="show" className="max-w-3xl mx-auto space-y-4">

        {/* Header */}
        <motion.div variants={item} className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold font-display">Friction Report</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <Globe size={12} className="text-white/30" />
              <span className="text-white/35 text-xs truncate max-w-sm">{targetUrl || '—'}</span>
            </div>
          </div>
          <div className="flex gap-2">
            <motion.button
              onClick={() => download(suggestions, backendFrictionEvents, eegFrictionEvents, eegSessionMetrics, targetUrl)}
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

        {/* Summary stats */}
        <motion.div variants={item} className="grid grid-cols-3 gap-3">
          {[
            { label: 'Total friction points', value: totalFriction },
            {
              label: eegSessionMetrics ? 'Peak EEG load' : 'High-severity events',
              value: eegSessionMetrics ? `${eegSessionMetrics.maxLoad}/100` : (backendFrictionEvents.length > 0 ? highSeverity : highLoadCount),
              accent: eegSessionMetrics ? eegSessionMetrics.maxLoad >= 78 : (backendFrictionEvents.length > 0 ? highSeverity : highLoadCount) > 0,
            },
            {
              label: eegSessionMetrics ? 'Engagement' : (suggestions.length > 0 ? 'Avg EEG load' : 'Backend events'),
              value: eegSessionMetrics
                ? `${eegSessionMetrics.meanEngagement}%`
                : suggestions.length > 0
                  ? `${Math.round(suggestions.reduce((a, s) => a + s.eegLoad, 0) / suggestions.length)}/100`
                  : backendFrictionEvents.length,
            },
          ].map(({ label, value, accent }) => (
            <div key={label} className="panel p-5 text-center">
              <p className="text-[11px] text-white/25 mb-1">{label}</p>
              <p className={`text-2xl font-light ${accent ? 'text-red-400' : 'text-white'}`}>{value}</p>
            </div>
          ))}
        </motion.div>

        {/* EEG session metrics */}
        {eegSessionMetrics && (
          <motion.div variants={item} className="panel p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Activity size={12} className="text-mint-500" />
              <h3 className="text-sm font-semibold">EEG Session Metrics</h3>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: 'Mean load', value: `${eegSessionMetrics.meanLoad}/100`, accent: eegSessionMetrics.meanLoad >= 65 },
                { label: 'Peak load', value: `${eegSessionMetrics.maxLoad}/100`, accent: eegSessionMetrics.maxLoad >= 78 },
                { label: 'High-load time', value: `${eegSessionMetrics.highLoadPct}%`, accent: eegSessionMetrics.highLoadPct >= 30 },
                { label: 'Engagement', value: `${eegSessionMetrics.meanEngagement}%`, accent: false },
              ].map(({ label, value, accent }) => (
                <div key={label} className="bg-white/[0.03] rounded-lg px-3 py-2.5 text-center">
                  <p className="text-[11px] text-white/25 mb-1">{label}</p>
                  <p className={`text-sm font-medium ${accent ? 'text-red-400' : 'text-white/70'}`}>{value}</p>
                </div>
              ))}
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between text-[11px] text-white/20">
                <span>Low</span><span>High</span>
              </div>
              <div className="h-2.5 rounded-full bg-white/[0.06] overflow-visible relative">
                <div className="absolute inset-0 rounded-full bg-gradient-to-r from-mint-500/70 via-yellow-400/70 to-red-400/70" />
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-1 h-4 bg-white rounded-full shadow-[0_0_8px_rgba(255,255,255,0.8)]"
                  style={{ left: `calc(${eegSessionMetrics.meanLoad}% - 2px)` }}
                />
              </div>
            </div>
          </motion.div>
        )}

        {/* AI narrative report */}
        {(isGeneratingReport || aiReport) && (
          <motion.div variants={item} className="panel p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles size={12} className="text-violet-400" />
              <h3 className="text-sm font-semibold">AI Analysis</h3>
              {isGeneratingReport && <Loader2 size={11} className="animate-spin text-violet-400/50 ml-auto" />}
            </div>
            {isGeneratingReport && !aiReport && (
              <p className="text-white/25 text-xs">Interpreting EEG and gaze data…</p>
            )}
            {aiReport && (
              <p className="text-white/70 text-sm leading-relaxed whitespace-pre-wrap">{aiReport}</p>
            )}
          </motion.div>
        )}

        {/* EEG friction events */}
        {eegFrictionEvents.length > 0 && (
          <motion.div variants={item}>
            <div className="flex items-center gap-2 mb-3">
              <Brain size={12} className="text-mint-500" />
              <p className="text-xs font-medium text-white/35">EEG friction events</p>
            </div>
            <div className="space-y-3">
              {eegFrictionEvents.map((e, i) => {
                const meta = EEG_EVENT_META[e.type] ?? EEG_EVENT_META.cognitive_overload
                const { Icon } = meta
                return (
                  <motion.div key={i} variants={item} className={`panel p-5 border ${meta.card}`}>
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-white/[0.04] border border-white/[0.07] flex items-center justify-center flex-shrink-0">
                          <span className="text-[11px] text-white/35">{i + 1}</span>
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold">{meta.label}</span>
                            <span className={`text-xs px-1.5 py-0.5 rounded border capitalize ${SEVERITY_STYLES[e.severity] || SEVERITY_STYLES.medium}`}>
                              {e.severity}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 mt-0.5">
                            <span className="text-xs text-white/35 flex items-center gap-1">
                              <Clock size={9} />{formatMs(e.elapsed)}
                            </span>
                            <span className="text-xs text-white/25">{formatMs(e.duration)} long</span>
                          </div>
                        </div>
                      </div>
                      <Icon size={13} className="text-white/20 flex-shrink-0 mt-0.5" />
                    </div>
                    <div className="bg-white/[0.03] border border-white/[0.05] rounded-lg p-3">
                      <p className="text-xs text-white/35 leading-relaxed">
                        {e.type === 'cognitive_overload' && (
                          <>{meta.sub} — peak load <span className="text-red-400">{e.peakLoad}/100</span>. Reduce information density or add progressive disclosure at this point.</>
                        )}
                        {e.type === 'disengagement' && (
                          <>{meta.sub} — floor load <span className="text-yellow-400">{e.minLoad}/100</span>. Add visual anchors, contrast, or interactive checkpoints.</>
                        )}
                      </p>
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </motion.div>
        )}

        {/* Backend friction events */}
        {backendFrictionEvents.length > 0 && (
          <motion.div variants={item}>
            <div className="flex items-center gap-2 mb-3">
              <Activity size={12} className="text-mint-500" />
              <p className="text-xs font-medium text-white/35">Behavioral friction events</p>
            </div>
            <div className="space-y-3">
              {backendFrictionEvents.map((e, i) => (
                <motion.div key={e.friction_event_id ?? i} variants={item} className="panel p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-mint-500/10 border border-mint-500/20 flex items-center justify-center flex-shrink-0">
                        <span className="text-[11px] text-mint-500">{i + 1}</span>
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold">{e.element_id || 'Page region'}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded border capitalize ${SEVERITY_STYLES[e.severity] || SEVERITY_STYLES.medium}`}>
                            {e.severity}
                          </span>
                          <span className="text-xs px-1.5 py-0.5 rounded bg-white/[0.05] text-white/30 border border-white/[0.06]">
                            score {Math.round(e.friction_score * 100)}%
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {(e.evidence || []).map(ev => (
                            <span key={ev} className="text-[11px] px-1.5 py-0.5 rounded bg-white/[0.04] text-white/25 border border-white/[0.06]">
                              {EVIDENCE_LABELS[ev] ?? ev}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <AlertTriangle size={13} className="text-orange-400/60 flex-shrink-0" />
                  </div>
                  {e.suggestion && (
                    <div className="bg-mint-500/[0.05] border border-mint-500/15 rounded-lg p-3 space-y-1">
                      <p className="text-[11px] text-mint-500/60 font-medium uppercase tracking-wide">
                        {e.suggestion.priority} priority · {e.suggestion.problem}
                      </p>
                      <p className="text-sm text-white/70 leading-relaxed">{e.suggestion.suggestion}</p>
                      {e.suggestion.rationale && (
                        <p className="text-xs text-white/30 leading-relaxed">{e.suggestion.rationale}</p>
                      )}
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Gaze fixation suggestions */}
        {suggestions?.length > 0 && (
          <motion.div variants={item}>
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={12} className="text-violet-400" />
              <p className="text-xs font-medium text-white/35">
                {isDemoSite ? 'Detected friction points' : 'Gaze fixation events'}
              </p>
            </div>
            <div className="space-y-3">
              {suggestions.map((s, i) => (
                <motion.div key={s.id ?? i} variants={item} className="panel p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-violet-500/10 border border-violet-500/20 flex items-center justify-center flex-shrink-0">
                        <span className="text-[11px] text-violet-400">{i + 1}</span>
                      </div>
                      <div>
                        <span className="text-sm font-semibold">
                          {s.elementLabel && s.elementLabel !== 'unknown element' ? s.elementLabel : 'Page region'}
                        </span>
                        <div className="flex items-center gap-3 mt-0.5">
                          {!isDemoSite && (
                            <span className="text-xs text-white/35 flex items-center gap-1">
                              <Clock size={9} />{formatMs(s.sessionElapsed)}
                            </span>
                          )}
                          <span className="text-xs text-white/35 flex items-center gap-1">
                            <Brain size={9} />EEG {s.eegLoad}/100
                          </span>
                          {s.eegLoad >= 70 && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-red-400/10 text-red-400 border border-red-400/20">
                              High load
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <Sparkles size={13} className="text-violet-400/60 flex-shrink-0" />
                  </div>
                  <div className="bg-violet-500/[0.06] border border-violet-500/15 rounded-lg p-3">
                    <p className="text-sm text-white/70 leading-relaxed">{s.suggestion ?? s.text}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Deploy improved version — only for the Coastal Home Services demo */}
        {isDemoSite && (
          <motion.div variants={item} className="panel p-5">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Sparkles size={11} className="text-mint-500" />
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-mint-500">Suggested improvement</span>
                </div>
                <p className="text-white/70 text-sm font-medium mb-1">
                  An improved version of this page addresses all {FIXED_REPORT.length} friction points above:
                  no popup, no fake warning banner, no unsolicited chat bait, and the pricing, rating
                  and response-time claims no longer contradict themselves.
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
        )}

      </motion.div>
    </div>
  )
}
