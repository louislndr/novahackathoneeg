import { useState, useRef, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Globe, Play, Square, ArrowRight, Loader2, AlertTriangle,
  Brain, Eye, Sparkles, Clock, X, RefreshCw, ExternalLink,
} from 'lucide-react'
import EEGWave from '../components/EEGWave'
import GazeTracker from '../components/GazeTracker'
import { formatMsLive, formatMs } from '../App'

function WebcamFeed({ active }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const [ready, setReady] = useState(false)
  const [denied, setDenied] = useState(false)

  useEffect(() => {
    if (!active) return
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'user', width: 320, height: 240 } })
      .then((stream) => {
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          setReady(true)
        }
      })
      .catch(() => setDenied(true))

    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop())
      setReady(false)
    }
  }, [active])

  if (!active) return null

  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.05]">
        <div className="flex items-center gap-1.5">
          <motion.span
            animate={ready ? { opacity: [1, 0.3, 1] } : {}}
            transition={{ repeat: Infinity, duration: 1.6 }}
            className={`w-1.5 h-1.5 rounded-full ${ready ? 'bg-red-400' : 'bg-white/20'}`}
          />
          <span className="text-[10px] font-semibold text-white/30 uppercase tracking-widest">
            {ready ? 'Live Camera' : denied ? 'Camera blocked' : 'Connecting…'}
          </span>
        </div>
        {ready && (
          <span className="text-[9px] text-white/20 font-mono">participant view</span>
        )}
      </div>

      {denied ? (
        <div className="px-3 py-4 text-center">
          <p className="text-white/25 text-xs">Camera permission denied</p>
        </div>
      ) : (
        <div className="relative bg-[#080808]" style={{ aspectRatio: '4/3' }}>
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="w-full h-full object-cover"
            style={{ transform: 'scaleX(-1)' /* mirror */ }}
          />
          {!ready && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 size={16} className="text-white/20 animate-spin" />
            </div>
          )}
          {/* Subtle scan-line overlay for aesthetic */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.08) 2px, rgba(0,0,0,0.08) 4px)',
            }}
          />
        </div>
      )}
    </div>
  )
}

const DEMO_SITES = [
  { label: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Electroencephalography' },
  { label: 'MDN Web Docs', url: 'https://developer.mozilla.org/en-US/docs/Web/HTML' },
  { label: 'Example.com', url: 'https://example.com' },
]

function EmptyPreview({ onLoad }) {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-6 text-center px-8">
      <div className="w-16 h-16 rounded-2xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center">
        <Globe size={24} className="text-white/20" />
      </div>
      <div>
        <h3 className="text-white/50 font-medium mb-1">No page loaded</h3>
        <p className="text-white/25 text-sm">Enter a URL above to load a live preview</p>
      </div>
      <div>
        <p className="text-white/20 text-xs mb-3 uppercase tracking-wider">Try these</p>
        <div className="flex flex-wrap gap-2 justify-center">
          {DEMO_SITES.map(({ label, url }) => (
            <button
              key={label}
              onClick={() => onLoad(url)}
              className="btn-ghost text-xs py-1.5 px-3"
            >
              {label}
              <ArrowRight size={11} />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function FrictionEntry({ entry, index }) {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) return null

  return (
    <motion.div
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
      className="panel-sm p-3 mb-2.5"
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5">
          <Sparkles size={10} className="text-mint-500 flex-shrink-0" />
          <span className="text-[10px] font-semibold text-mint-500 uppercase tracking-wider">Friction detected</span>
        </div>
        <button onClick={() => setDismissed(true)} className="text-white/20 hover:text-white/50 flex-shrink-0">
          <X size={11} />
        </button>
      </div>

      <div className="flex items-center gap-3 mb-2">
        <span className="text-[10px] text-white/25 font-mono">{formatMs(entry.sessionElapsed)}</span>
        <span className="text-[10px] text-white/20">·</span>
        <span className="text-[10px] text-white/25">
          EEG <span className="text-red-400 font-mono">{entry.eegLoad}</span>/100
        </span>
        {entry.elementLabel && (
          <>
            <span className="text-[10px] text-white/20">·</span>
            <span className="text-[10px] text-white/30 font-mono truncate max-w-[80px]">{entry.elementLabel}</span>
          </>
        )}
      </div>

      <p className="text-white/70 text-[12px] leading-relaxed">{entry.text}</p>
    </motion.div>
  )
}

function ResearchPanel({ sessionActive, elapsed, eegMode, gazeEnabled, suggestions, onStart, onStop, targetUrl }) {
  const hasSuggestions = suggestions.length > 0

  return (
    <div className="w-72 flex-shrink-0 flex flex-col gap-3 overflow-hidden">
      {/* Session controls */}
      <div className="panel p-4">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-3">Session</p>
        {!sessionActive ? (
          <motion.button
            onClick={onStart}
            disabled={!targetUrl}
            whileHover={targetUrl ? { scale: 1.02 } : {}}
            whileTap={targetUrl ? { scale: 0.97 } : {}}
            className="btn-mint w-full justify-center"
          >
            <Play size={13} />
            Start analysis
          </motion.button>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <motion.span animate={{ opacity: [1, 0.2, 1] }} transition={{ repeat: Infinity, duration: 1.5 }} className="w-1.5 h-1.5 rounded-full bg-mint-500" />
                <span className="text-mint-500 text-xs font-medium">Recording</span>
              </div>
              <span className="text-white/50 text-xs font-mono">{formatMsLive(elapsed)}</span>
            </div>
            <motion.button
              onClick={onStop}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              className="btn-ghost w-full justify-center text-red-400 border-red-400/20 hover:bg-red-400/5"
            >
              <Square size={11} />
              Stop &amp; view report
            </motion.button>
          </div>
        )}

        {!targetUrl && (
          <p className="text-white/20 text-[10px] mt-2 text-center">Load a URL first</p>
        )}
      </div>

      {/* Signal status */}
      <div className="panel p-4 space-y-2.5">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30">Signals</p>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-white/45 text-xs">
            <Brain size={11} />
            EEG
          </div>
          <span className={`text-[11px] font-medium ${eegMode === 'simulated' ? 'text-yellow-400' : 'text-white/20'}`}>
            {eegMode === 'simulated' ? 'Simulated' : 'Disconnected'}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-white/45 text-xs">
            <Eye size={11} />
            Eye tracking
          </div>
          <span className={`text-[11px] font-medium ${gazeEnabled ? 'text-violet-400' : 'text-white/20'}`}>
            {gazeEnabled ? 'Active' : 'Off'}
          </span>
        </div>

        {eegMode === 'simulated' && (
          <div className="bg-[#0f0f0f] rounded-lg overflow-hidden mt-1">
            <EEGWave active={true} height={44} channelIndex={0} />
          </div>
        )}

        {!gazeEnabled && (
          <p className="text-white/20 text-[10px]">Enable eye tracking in Signal Setup</p>
        )}
      </div>

      {/* Friction log */}
      <div className="panel p-4 flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30">Friction Log</p>
          {hasSuggestions && (
            <span className="text-[10px] font-mono text-white/30">{suggestions.length} found</span>
          )}
        </div>

        <div className="flex-1 overflow-auto min-h-0">
          {!hasSuggestions ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-6">
              <Sparkles size={18} className="text-white/10 mb-2" />
              <p className="text-white/20 text-xs leading-relaxed">
                {sessionActive
                  ? 'Watching for friction…\nFixate on elements for 2s'
                  : 'Start a session to begin\ncollecting friction points'}
              </p>
            </div>
          ) : (
            suggestions.map((s, i) => (
              <FrictionEntry key={s.id} entry={s} index={i} />
            ))
          )}
        </div>
      </div>
    </div>
  )
}

export default function StudyScreen({
  sessionActive, targetUrl, setTargetUrl,
  eegMode, gazeEnabled, apiKey,
  suggestions, addSuggestion,
  elapsed,
  startSession, stopSession,
}) {
  const [urlInput, setUrlInput] = useState('')
  const [iframeUrl, setIframeUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [iframeKey, setIframeKey] = useState(0)
  const iframeRef = useRef(null)

  function normalizeUrl(raw) {
    const u = raw.trim()
    if (!u) return ''
    if (u.startsWith('http://') || u.startsWith('https://')) return u
    return 'https://' + u
  }

  function loadUrl(url) {
    const normalized = normalizeUrl(url || urlInput)
    if (!normalized) return
    setUrlInput(normalized)
    setIframeUrl(normalized)
    setTargetUrl(normalized)
    setLoading(true)
    setIframeKey(k => k + 1)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') loadUrl()
  }

  function reload() {
    setLoading(true)
    setIframeKey(k => k + 1)
  }

  const handleSuggestion = useCallback((entry) => {
    addSuggestion(entry)
  }, [addSuggestion])

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* URL bar */}
      <div className="flex-shrink-0 px-5 py-3 border-b border-white/[0.05] flex items-center gap-2">
        <div className="flex-1 flex items-center gap-2 bg-[#111111] border border-white/[0.07] rounded-lg px-3 py-2 focus-within:border-mint-500/30 focus-within:ring-1 focus-within:ring-mint-500/10 transition-all">
          <Globe size={13} className="text-white/25 flex-shrink-0" />
          <input
            type="url"
            value={urlInput}
            onChange={e => setUrlInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter a URL to analyse — e.g. https://example.com"
            className="flex-1 bg-transparent text-sm text-white placeholder:text-white/20 outline-none"
          />
          {iframeUrl && (
            <button onClick={reload} className="text-white/25 hover:text-white/60 transition-colors flex-shrink-0">
              <RefreshCw size={12} />
            </button>
          )}
        </div>

        <motion.button
          onClick={() => loadUrl()}
          disabled={!urlInput.trim()}
          whileHover={urlInput.trim() ? { scale: 1.02 } : {}}
          whileTap={urlInput.trim() ? { scale: 0.97 } : {}}
          className="btn-mint py-2"
        >
          Load
          <ArrowRight size={13} />
        </motion.button>

        {iframeUrl && (
          <a
            href={iframeUrl}
            target="_blank"
            rel="noreferrer"
            className="btn-ghost py-2"
            title="Open in new tab"
          >
            <ExternalLink size={13} />
          </a>
        )}
      </div>

      {/* Main area */}
      <div className="flex-1 flex gap-4 p-4 min-h-0 overflow-hidden">
        {/* Preview pane */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#0a0a0a] border border-white/[0.05] rounded-xl overflow-hidden relative">
          {/* Browser chrome */}
          {iframeUrl && (
            <div className="flex-shrink-0 h-8 bg-[#111111] border-b border-white/[0.05] flex items-center px-3 gap-2">
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-white/10" />
                <div className="w-2.5 h-2.5 rounded-full bg-white/10" />
                <div className="w-2.5 h-2.5 rounded-full bg-white/10" />
              </div>
              <span className="text-[11px] text-white/25 font-mono truncate flex-1 text-center">
                {iframeUrl}
              </span>
              {loading && <Loader2 size={11} className="text-white/25 animate-spin flex-shrink-0" />}
            </div>
          )}

          {/* iframe / empty state */}
          {iframeUrl ? (
            <div className="flex-1 relative">
              <iframe
                key={iframeKey}
                ref={iframeRef}
                src={iframeUrl}
                title="Website preview"
                className="w-full h-full border-0 bg-white"
                onLoad={() => setLoading(false)}
              />

              {/* Embedding-blocked warning overlay (shown briefly if iframe content is suspicious) */}
              {/* This is best-effort — iframes don't reliably report X-Frame-Options errors */}
            </div>
          ) : (
            <EmptyPreview onLoad={(url) => { setUrlInput(url); loadUrl(url) }} />
          )}

          {/* Gaze tracker mounts here so its dot overlays the iframe */}
          <GazeTracker
            enabled={gazeEnabled}
            sessionActive={sessionActive}
            targetUrl={iframeUrl}
            apiKey={apiKey}
            eegMode={eegMode}
            elapsed={elapsed}
            iframeRef={iframeRef}
            onSuggestion={handleSuggestion}
          />
        </div>

        {/* Research panel */}
        <ResearchPanel
          sessionActive={sessionActive}
          elapsed={elapsed}
          eegMode={eegMode}
          gazeEnabled={gazeEnabled}
          suggestions={suggestions}
          onStart={startSession}
          onStop={stopSession}
          targetUrl={iframeUrl}
        />
      </div>

      {/* Embedding notice */}
      <AnimatePresence>
        {iframeUrl && !loading && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex-shrink-0 flex items-center justify-between px-5 py-2 border-t border-white/[0.04]"
          >
            <div className="flex items-center gap-1.5">
              <AlertTriangle size={10} className="text-white/20" />
              <span className="text-[10px] text-white/20">
                Some sites block embedding (X-Frame-Options). If the preview is blank, try a different URL.
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
