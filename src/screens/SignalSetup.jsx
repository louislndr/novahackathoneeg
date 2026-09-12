import { motion } from 'framer-motion'
import { Radio, Wifi, WifiOff, Eye, Loader2 } from 'lucide-react'

function Toggle({ value, onChange }) {
  return (
    <button
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      className={`relative flex-shrink-0 w-12 h-[26px] rounded-full outline-none transition-colors duration-200 ${
        value ? 'bg-mint-500' : 'bg-white/10'
      }`}
    >
      <span
        className={`absolute top-[3px] left-[3px] w-5 h-5 rounded-full bg-white shadow-md transition-transform duration-200 ease-in-out ${
          value ? 'translate-x-[22px]' : 'translate-x-0'
        }`}
      />
    </button>
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
                Streams via LSL
              </p>
            </div>
            <Toggle value={live} onChange={(v) => setEegMode(v ? 'live' : 'disconnected')} />
          </div>
        </motion.div>

        {/* Eye tracking */}
        <motion.div variants={item} className="panel w-full p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Eye size={15} className={gazeEnabled ? 'text-violet-400' : 'text-white/30'} />
                <h3 className="text-sm font-semibold">Eye Tracking</h3>
              </div>
              <p className="text-white/35 text-xs mt-0.5 ml-6">
                Webcam-based gaze tracking via WebGazer.js
              </p>
            </div>
            <Toggle value={gazeEnabled} onChange={setGazeEnabled} />
          </div>
        </motion.div>

      </motion.div>
    </div>
  )
}
