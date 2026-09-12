import { motion, AnimatePresence } from 'framer-motion'
import { Radio, Wifi, WifiOff, AlertTriangle, Activity, Settings, Eye, Key, Sparkles } from 'lucide-react'
import EEGWave from '../components/EEGWave'

const CHANNELS = ['Fp1', 'Fz', 'Cz', 'Pz', 'O1', 'T7']

function Toggle({ value, onChange }) {
  return (
    <motion.button
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      whileTap={{ scale: 0.95 }}
      className={`relative w-11 h-6 rounded-full border transition-colors duration-200 ${
        value ? 'bg-mint-500 border-mint-500' : 'bg-white/[0.06] border-white/[0.1]'
      }`}
    >
      <motion.span
        animate={{ x: value ? 20 : 2 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        className="absolute top-1 w-4 h-4 rounded-full bg-white shadow"
      />
    </motion.button>
  )
}

function DeviceCard({ title, subtitle, status, channels }) {
  const connected = status === 'connected'

  return (
    <div className="panel p-5">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <Radio size={14} className={connected ? 'text-mint-500' : 'text-white/25'} />
            <span className="text-sm font-semibold">{title}</span>
          </div>
          <p className="text-white/35 text-xs ml-6">{subtitle}</p>
        </div>
        <span className={`text-xs px-2.5 py-1 rounded-full font-medium border ${
          connected
            ? 'bg-mint-500/10 text-mint-500 border-mint-500/25'
            : 'bg-white/[0.03] text-white/25 border-white/[0.06]'
        }`}>
          {connected ? 'Connected' : 'Disconnected'}
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
        {!connected && (
          <span className="text-white/20 text-xs">Plug in hardware to connect</span>
        )}
      </div>
    </div>
  )
}

export default function SignalSetup({ eegMode, setEegMode, gazeEnabled, setGazeEnabled, apiKey, setApiKey }) {
  const simulated = eegMode === 'simulated'

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
          <p className="text-white/35 text-sm mt-0.5">Configure EEG and fNIRS hardware · Ready for live connection</p>
        </motion.div>

        {/* Hardware status */}
        <motion.div variants={item} className="flex flex-col gap-4">
          <DeviceCard title="EEG" subtitle="ANT Neuro eego™mylab" status="disconnected" channels={12} />
          <DeviceCard title="fNIRS" subtitle="ANT Neuro fNIRS system" status="disconnected" channels={8} />
        </motion.div>

        {/* Simulation toggle */}
        <motion.div variants={item} className="panel p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="flex items-center gap-2">
                <Activity size={15} className={simulated ? 'text-mint-500' : 'text-white/30'} />
                <h3 className="text-sm font-semibold">EEG Simulation Mode</h3>
              </div>
              <p className="text-white/35 text-xs mt-0.5 ml-6">
                Generate synthetic signals for demo and development
              </p>
            </div>
            <Toggle value={simulated} onChange={(v) => setEegMode(v ? 'simulated' : 'disconnected')} />
          </div>

          <AnimatePresence>
            {simulated && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="flex items-start gap-2.5 p-4 rounded-lg bg-yellow-500/[0.06] border border-yellow-500/20 mt-3">
                  <AlertTriangle size={13} className="text-yellow-400 flex-shrink-0 mt-0.5" />
                  <p className="text-yellow-400/80 text-xs leading-relaxed">
                    <strong>Simulated EEG</strong> — All signals shown below are algorithmically generated. They do not represent real brain activity, cognitive states, or any physiological measurement.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Multi-channel EEG display */}
        <AnimatePresence>
          {simulated && (
            <motion.div
              variants={item}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="panel p-5"
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold">Live Signal Preview</h3>
                  <p className="text-white/35 text-xs mt-0.5">6 of 12 channels shown</p>
                </div>
                <span className="text-xs px-2.5 py-1 rounded-full border font-semibold bg-yellow-500/[0.08] text-yellow-400 border-yellow-500/20">
                  SIMULATED EEG
                </span>
              </div>

              <div className="space-y-2">
                {CHANNELS.map((ch, i) => (
                  <motion.div
                    key={ch}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="flex items-center gap-3"
                  >
                    <span className="text-white/30 text-[11px] w-7 flex-shrink-0 text-right">{ch}</span>
                    <div className="flex-1 bg-[#0f0f0f] rounded-lg overflow-hidden" style={{ height: 44 }}>
                      <EEGWave active={true} height={44} channelIndex={i} />
                    </div>
                    <span className="text-white/15 text-[10px] w-14 text-right flex-shrink-0">
                      {(Math.random() * 20 + 5).toFixed(1)} μV
                    </span>
                  </motion.div>
                ))}
              </div>

              <p className="text-white/15 text-[10px] text-center mt-4">
                Signals are synthetic · Not for clinical or research use
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Eye tracking + AI */}
        <motion.div variants={item} className="panel p-5">
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

        {/* Live connection instructions */}
        <motion.div variants={item} className="panel p-5">
          <div className="flex items-center gap-2 mb-4">
            <Settings size={14} className="text-white/30" />
            <h3 className="text-sm font-semibold">Live Hardware Connection</h3>
          </div>
          <div className="space-y-3">
            {[
              { step: '01', text: 'Connect ANT Neuro EEG device via USB or Wi-Fi' },
              { step: '02', text: 'Launch ANT Neuro eego software and start a recording session' },
              { step: '03', text: 'Connect via LSL stream — FrictionFix will auto-detect the signal' },
              { step: '04', text: 'Verify channel mapping and sampling rate (≥256 Hz recommended)' },
            ].map(({ step, text }) => (
              <div key={step} className="flex items-start gap-3">
                <span className="text-[10px] text-white/20 pt-0.5 w-5 flex-shrink-0">{step}</span>
                <p className="text-white/40 text-sm leading-relaxed">{text}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 px-4 py-3 rounded-lg bg-white/[0.02] border border-white/[0.05]">
            <p className="text-white/20 text-xs">
              LSL stream name: <span className="text-white/40">FrictionFix_EEG</span> · Port: <span className="text-white/40">4513</span>
            </p>
          </div>
        </motion.div>
      </motion.div>
    </div>
  )
}
