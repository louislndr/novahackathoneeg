import { motion, AnimatePresence } from 'framer-motion'
import { Radio, Wifi, WifiOff, Eye, Key, Sparkles, Loader2 } from 'lucide-react'

function Toggle({ value, onChange }) {
  return (
    <motion.button
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      whileTap={{ scale: 0.96 }}
      className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors duration-200 ${
        value ? 'bg-mint-500' : 'bg-white/[0.1]'
      }`}
    >
      <motion.span
        animate={{ x: value ? 22 : 2 }}
        transition={{ type: 'spring', stiffness: 600, damping: 35 }}
        className={`absolute top-[3px] w-[18px] h-[18px] rounded-full shadow-sm transition-colors duration-200 ${
          value ? 'bg-white' : 'bg-white/70'
        }`}
      />
    </motion.button>
  )
}

function DeviceCard({ title, subtitle, status, channels }) {
  const connected = status === 'connected'
  const connecting = status === 'connecting'
  const error = status === 'error'

  const badgeClass = connected
    ? 'bg-mint-500/10 text-mint-500 border-mint-500/25'
    : error
    ? 'bg-red-400/10 text-red-400 border-red-400/20'
    : connecting
    ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
    : 'bg-white/[0.03] text-white/25 border-white/[0.06]'

  const badgeLabel = connected ? 'Connected' : error ? 'Error' : connecting ? 'Connecting…' : 'Disconnected'

  return (
    <div className="panel w-full p-5">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <Radio size={14} className={connected ? 'text-mint-500' : 'text-white/25'} />
            <span className="text-sm font-semibold">{title}</span>
          </div>
          <p className="text-white/35 text-xs ml-6">{subtitle}</p>
        </div>
        <span className={`text-xs px-2.5 py-1 rounded-full font-medium border flex items-center gap-1.5 ${badgeClass}`}>
          {connecting && <Loader2 size={9} className="animate-spin" />}
          {badgeLabel}
        </span>
      </div>
      <div className="flex items-center gap-4 mt-3">
        <div className="flex items-center gap-1.5">
          {connected
            ? <Wifi size={12} className="text-mint-500" />
            : <WifiOff size={12} className="text-white/20" />
          }
          <span className="text-white/30 text-xs">{channels} channels</span>
        </div>
        {!connected && !connecting && !error && (
          <span className="text-white/20 text-xs">Run bridge.py to connect</span>
        )}
        {error && (
          <span className="text-red-400/60 text-xs">bridge.py not running?</span>
        )}
      </div>
    </div>
  )
}

export default function SignalSetup({ eegMode, setEegMode, gazeEnabled, setGazeEnabled, apiKey, setApiKey, eegWsStatus }) {
  const live = eegMode === 'live'

  const container = {
    hidden: {},
    show: { transition: { staggerChildren: 0.07 } },
  }
  const item = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0, transition: { duration: 0.22 } },
  }

  return (
    <div className="h-full overflow-auto p-5">
      <motion.div variants={container} initial="hidden" animate="show" className="max-w-3xl mx-auto space-y-4">
        {/* Header */}
        <motion.div variants={item}>
          <h1 className="text-2xl font-semibold font-display">Signal Setup</h1>
          <p className="text-white/35 text-sm mt-0.5">Connect your EEG and eye tracking signals</p>
        </motion.div>

        {/* Hardware status */}
        <motion.div variants={item} className="flex flex-col gap-4">
          <DeviceCard
            title="EEG"
            subtitle="ANT Neuro eego™mylab"
            status={live ? eegWsStatus : 'disconnected'}
            channels={12}
          />
        </motion.div>

        {/* Live EEG toggle */}
        <motion.div variants={item} className="panel p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Wifi size={15} className={live ? 'text-mint-500' : 'text-white/30'} />
                <h3 className="text-sm font-semibold">Live EEG</h3>
              </div>
              <p className="text-white/35 text-xs mt-0.5 ml-6">
                Streams via LSL · run bridge.py first
              </p>
            </div>
            <Toggle value={live} onChange={(v) => setEegMode(v ? 'live' : 'disconnected')} />
          </div>

          <AnimatePresence>
            {live && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="mt-4 bg-[#0f0f0f] border border-white/[0.07] rounded-lg p-4 space-y-1.5">
                  <p className="text-white/40 text-xs font-medium mb-2">Setup</p>
                  {[
                    { text: 'pip install pylsl websockets numpy', mono: true },
                    { text: 'Open eego · start recording · Extras → LSL → Start', mono: false },
                    { text: 'python3 bridge.py', mono: true },
                  ].map(({ text, mono }, i) => (
                    <div key={i} className="flex items-start gap-2.5">
                      <span className="text-[10px] text-white/20 pt-0.5 w-4 flex-shrink-0">{i + 1}</span>
                      <p className={`text-xs ${mono ? 'font-mono text-white/60' : 'text-white/40'}`}>{text}</p>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Eye tracking + AI */}
        <motion.div variants={item} className="panel w-full p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="flex items-center gap-2">
                <Eye size={15} className={gazeEnabled ? 'text-violet-400' : 'text-white/30'} />
                <h3 className="text-sm font-semibold">Eye Tracking + AI Analysis</h3>
              </div>
              <p className="text-white/35 text-xs mt-0.5 ml-6">
                WebGazer.js tracks gaze · fixation + EEG load triggers Claude
              </p>
            </div>
            <Toggle value={gazeEnabled} onChange={setGazeEnabled} />
          </div>

          <AnimatePresence>
            {gazeEnabled && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="mt-4 space-y-3">
                  {/* How it works */}
                  <div className="bg-violet-500/[0.06] border border-violet-500/20 rounded-lg p-4">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Sparkles size={12} className="text-violet-400" />
                      <span className="text-xs font-medium text-violet-400">How it works</span>
                    </div>
                    <div className="space-y-1.5 text-xs text-white/45 leading-relaxed">
                      <p>1. Webcam tracks your gaze in real time via WebGazer.js</p>
                      <p>2. Fixation ≥2s on an element + EEG load ≥42/100 triggers analysis</p>
                      <p>3. Claude receives element context and suggests a specific simplification</p>
                      <p>4. Suggestion card appears near the fixated element</p>
                    </div>
                  </div>

                  {/* API key input */}
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-medium text-white/40 mb-1.5">
                      <Key size={10} />
                      Anthropic API Key
                    </label>
                    <input
                      type="password"
                      value={apiKey}
                      onChange={e => setApiKey(e.target.value)}
                      placeholder="sk-ant-..."
                      className="input-base text-xs"
                      autoComplete="off"
                    />
                    <p className="text-white/20 text-[10px] mt-1.5">
                      Key is used only for in-browser API calls · never stored or sent elsewhere
                    </p>
                  </div>

                  {apiKey.trim() && (
                    <div className="flex items-center gap-1.5 text-xs text-mint-500">
                      <span className="w-1.5 h-1.5 rounded-full bg-mint-500 inline-block" />
                      API key set · eye tracking ready
                    </div>
                  )}
                  {gazeEnabled && !apiKey.trim() && (
                    <p className="text-yellow-400/70 text-xs">
                      ⚠ Add your API key above to enable Claude suggestions
                    </p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

      </motion.div>
    </div>
  )
}
