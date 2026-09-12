import { useState, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Globe, Play, Square, ArrowRight, Loader2, RefreshCw,
} from 'lucide-react'
import GazeTracker from '../components/GazeTracker'
import { formatMsLive } from '../App'

const DEMO_SITES = [
  { label: 'Bookstore', url: 'https://books.toscrape.com' },
  { label: 'Quotes Blog', url: 'https://quotes.toscrape.com' },
  { label: 'Test Forms', url: 'https://the-internet.herokuapp.com' },
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
        <p className="text-white/20 text-xs mb-3">Try these</p>
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

export default function StudyScreen({
  sessionActive, targetUrl, setTargetUrl,
  eegMode, gazeEnabled, apiKey,
  suggestions, addSuggestion,
  elapsed, liveEegLoad, recalibrateKey,
  startSession, stopSession, sendGaze, sendBehaviorEvent,
}) {
  const [urlInput, setUrlInput] = useState('')
  const [iframeUrl, setIframeUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [iframeKey, setIframeKey] = useState(0)
  const iframeRef = useRef(null)

  // Rage-click detection: track rapid clicks in the same region
  const clickHistoryRef = useRef([])
  const handleIframeClick = useCallback((e) => {
    if (!sessionActive || !iframeUrl) return
    const now = Date.now()
    const WINDOW_MS = 2000
    const REGION_PX = 60
    clickHistoryRef.current = clickHistoryRef.current.filter(c => now - c.t < WINDOW_MS)
    clickHistoryRef.current.push({ x: e.clientX, y: e.clientY, t: now })
    const nearby = clickHistoryRef.current.filter(c =>
      Math.hypot(c.x - e.clientX, c.y - e.clientY) < REGION_PX
    )
    if (nearby.length >= 3) {
      sendBehaviorEvent?.({
        type: 'rage_click',
        page_url: iframeUrl,
        element_id: null,
        click_count: nearby.length,
      })
      clickHistoryRef.current = []
    } else if (nearby.length >= 2) {
      sendBehaviorEvent?.({
        type: 'repeated_click',
        page_url: iframeUrl,
        element_id: null,
        click_count: nearby.length,
      })
    }
  }, [sessionActive, iframeUrl, sendBehaviorEvent])

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
      {/* URL bar + session controls */}
      <div className="flex-shrink-0 px-5 py-3 border-b border-white/[0.05] flex items-center gap-3">
        <div className="flex-1 flex items-center gap-2 bg-[#111111] border border-white/[0.07] rounded-lg px-3 py-2.5 focus-within:border-mint-500/30 focus-within:ring-1 focus-within:ring-mint-500/10 transition-all">
          <Globe size={13} className="text-white/25 flex-shrink-0" />
          <input
            type="url"
            value={urlInput}
            onChange={e => setUrlInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter a URL to analyse — e.g. https://books.toscrape.com"
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
          className="btn-mint py-2.5 flex-shrink-0 w-36 justify-center"
        >
          Load
          <ArrowRight size={13} />
        </motion.button>

        <div className="w-px h-5 bg-white/[0.08] flex-shrink-0" />

        {/* Session controls */}
        <AnimatePresence mode="wait">
          {!sessionActive ? (
            <motion.button
              key="start"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={startSession}
              disabled={!iframeUrl}
              whileHover={iframeUrl ? { scale: 1.02 } : {}}
              whileTap={iframeUrl ? { scale: 0.97 } : {}}
              className="btn-mint py-2.5 flex-shrink-0 w-40 justify-center"
            >
              <Play size={14} />
              Start analysis
            </motion.button>
          ) : (
            <motion.div
              key="recording"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex items-center gap-2 flex-shrink-0 w-40"
            >
              <div className="flex items-center gap-2 flex-1 bg-[#111111] border border-white/[0.07] rounded-lg px-3 py-2.5 min-w-0">
                <motion.span
                  animate={{ opacity: [1, 0.2, 1] }}
                  transition={{ repeat: Infinity, duration: 1.5 }}
                  className="w-1.5 h-1.5 rounded-full bg-mint-500 flex-shrink-0"
                />
                <span className="text-mint-500 text-xs font-medium tabular-nums truncate">{formatMsLive(elapsed)}</span>
              </div>
              <motion.button
                onClick={stopSession}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                className="btn-ghost py-2.5 px-3 text-red-400 border-red-400/20 hover:bg-red-400/5 flex-shrink-0"
              >
                <Square size={11} />
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Preview pane */}
      <div className="flex-1 p-5 min-h-0 overflow-hidden">
        <div className="h-full flex flex-col bg-[#0a0a0a] border border-white/[0.05] rounded-xl overflow-hidden relative">
          {/* Browser chrome */}
          {iframeUrl && (
            <div className="flex-shrink-0 h-8 bg-[#111111] border-b border-white/[0.05] flex items-center px-3 gap-2">
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-white/10" />
                <div className="w-2.5 h-2.5 rounded-full bg-white/10" />
                <div className="w-2.5 h-2.5 rounded-full bg-white/10" />
              </div>
              <span className="text-[11px] text-white/25 truncate flex-1 text-center">
                {iframeUrl}
              </span>
              {loading && <Loader2 size={11} className="text-white/25 animate-spin flex-shrink-0" />}
            </div>
          )}

          {iframeUrl ? (
            <div className="flex-1 relative" onClick={handleIframeClick}>
              <iframe
                key={iframeKey}
                ref={iframeRef}
                src={iframeUrl}
                title="Website preview"
                className="w-full h-full border-0 bg-white"
                onLoad={() => setLoading(false)}
              />
            </div>
          ) : (
            <EmptyPreview onLoad={(url) => { setUrlInput(url); loadUrl(url) }} />
          )}

          <GazeTracker
            enabled={gazeEnabled}
            sessionActive={sessionActive}
            targetUrl={iframeUrl}
            apiKey={apiKey}
            eegMode={eegMode}
            iframeRef={iframeRef}
            onSuggestion={handleSuggestion}
            onGaze={sendGaze}
            liveEegLoad={liveEegLoad}
            recalibrateKey={recalibrateKey}
          />
        </div>
      </div>

    </div>
  )
}
