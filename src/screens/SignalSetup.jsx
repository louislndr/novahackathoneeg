import { useState } from 'react'
import { motion } from 'framer-motion'
import { Radio, Wifi, Eye, Loader2 } from 'lucide-react'

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

function StatusBadge({ status }) {
  const connected  = status === 'connected'
  const searching  = status === 'searching'
  const connecting = status === 'connecting'
  const error      = status === 'error'
  const busy       = searching || connecting

  const cls = connected  ? 'bg-mint-500/10 text-mint-500 border-mint-500/25'
    : error              ? 'bg-red-400/10 text-red-400 border-red-400/20'
    : busy               ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
    :                      'bg-white/[0.03] text-white/25 border-white/[0.06]'

  const label = connected ? 'Connected' : error ? 'Error' : searching ? 'Searching…' : connecting ? 'Connecting…' : 'Disconnected'

  return (
    <span className={`text-xs px-2.5 py-1 rounded-full font-medium border flex items-center gap-1.5 ${cls}`}>
      {busy && <Loader2 size={9} className="animate-spin" />}
      {label}
    </span>
  )
}

const DEVICES = {
  eego: {
    name: 'ANT Neuro eego™mylab',
    channels: 24,
    steps: [
      'Open ANT Neuro eego software and start a recording',
      'Enable LSL streaming: Extras → LSL → Start',
      'On the same machine as your browser, run:',
    ],
    bridge:    'python3 bridge.py',
    bridgeWin: 'python bridge.py',
    setup:     'pip install pylsl websockets numpy',
  },
  unicorn: {
    name: 'g.tec Unicorn Hybrid Black',
    channels: 8,
    steps: [
      'Install Python from python.org (NOT Microsoft Store)',
      'Power on the Unicorn and pair it via Bluetooth',
      'Close Unicorn Suite if open — it locks the port',
      'Find serial port:  Mac → ls /dev/tty.UN-*   Windows → Device Manager → Ports (COM & LPT)',
      'Run the bridge:',
    ],
    bridge:    'python3 bridge_unicorn.py --serial /dev/tty.UN-XXXXXXXX-SerialPort',
    bridgeWin: 'python bridge_unicorn.py --serial COM3',
    setup:     'pip install brainflow websockets numpy',
  },
}

export default function SignalSetup({ eegMode, setEegMode, gazeEnabled, setGazeEnabled, eegWsStatus, eegStreamInfo }) {
  const [selectedDevice, setSelectedDevice] = useState('eego')
  const live = eegMode === 'live'

  const connectedDevice = eegStreamInfo?.device ?? null
  const device = DEVICES[selectedDevice]

  // Status for the selected device — show connected only if it's actually this device
  const effectiveStatus = !live ? 'disconnected'
    : eegWsStatus === 'connected' && connectedDevice && connectedDevice !== selectedDevice ? 'disconnected'
    : eegWsStatus

  const container = { hidden: {}, show: { transition: { staggerChildren: 0.07 } } }
  const item = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.22 } } }

  return (
    <div className="h-full overflow-auto p-5">
      <motion.div variants={container} initial="hidden" animate="show" className="max-w-3xl mx-auto space-y-4">
        {/* Header */}
        <motion.div variants={item}>
          <h1 className="text-2xl font-semibold font-display">Signal Setup</h1>
          <p className="text-white/35 text-sm mt-0.5">Connect your EEG and eye tracking signals</p>
        </motion.div>

        {/* Live EEG panel */}
        <motion.div variants={item} className="panel p-5 space-y-4">
          {/* Toggle row */}
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Wifi size={15} className={live ? 'text-mint-500' : 'text-white/30'} />
                <h3 className="text-sm font-semibold">Live EEG</h3>
              </div>
              <p className="text-white/35 text-xs mt-0.5 ml-6">Streams via WebSocket bridge</p>
            </div>
            <Toggle value={live} onChange={(v) => setEegMode(v ? 'live' : 'disconnected')} />
          </div>

          {/* Device picker */}
          <div className="border-t border-white/[0.05] pt-4">
            <p className="text-[11px] text-white/25 font-medium mb-2">Device</p>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(DEVICES).map(([id, d]) => {
                const isSelected = selectedDevice === id
                const isConnected = eegWsStatus === 'connected' && connectedDevice === id
                return (
                  <button
                    key={id}
                    onClick={() => setSelectedDevice(id)}
                    className={`text-left rounded-lg border px-3 py-2.5 transition-all duration-150 ${
                      isSelected
                        ? 'border-mint-500/30 bg-mint-500/[0.06]'
                        : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12] hover:bg-white/[0.04]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Radio size={11} className={isSelected ? 'text-mint-500 flex-shrink-0' : 'text-white/20 flex-shrink-0'} />
                        <span className="text-xs text-white/70 font-medium truncate">{d.name}</span>
                      </div>
                      {isConnected && (
                        <span className="text-[10px] text-mint-500 flex-shrink-0">●</span>
                      )}
                    </div>
                    <p className="text-[10px] text-white/25 mt-0.5 ml-4">{d.channels} channels</p>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Status + instructions for selected device */}
          <div className="border-t border-white/[0.05] pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-white/35">{device.name}</span>
              <StatusBadge status={effectiveStatus} />
            </div>

            {/* Error: bridge not running */}
            {live && effectiveStatus === 'error' && (
              <div className="rounded-lg bg-red-400/[0.06] border border-red-400/15 px-3 py-3 space-y-2.5">
                <p className="text-xs text-red-400/80 font-medium">Bridge not running</p>
                <ol className="space-y-1">
                  {device.steps.map((step, i) => (
                    <li key={i} className="text-[11px] text-white/35 leading-relaxed">
                      <span className="text-white/20 mr-1.5">{i + 1}.</span>{step}
                    </li>
                  ))}
                </ol>
                <div className="space-y-1.5">
                  <div>
                    <p className="text-[10px] text-white/20 mb-0.5">Mac / Linux</p>
                    <code className="block text-[11px] font-mono bg-white/[0.05] text-white/60 px-2 py-1.5 rounded break-all">
                      {device.bridge}
                    </code>
                  </div>
                  <div>
                    <p className="text-[10px] text-white/20 mb-0.5">Windows — use <span className="text-white/40">python</span> not <span className="text-white/40">python3</span></p>
                    <code className="block text-[11px] font-mono bg-white/[0.05] text-white/60 px-2 py-1.5 rounded break-all">
                      {device.bridgeWin}
                    </code>
                  </div>
                </div>
                <p className="text-[10px] text-white/20">
                  Install deps first: <code className="font-mono bg-white/[0.04] px-1 rounded">{device.setup}</code>
                </p>
                <p className="text-[10px] text-white/20">Then toggle off and back on to reconnect.</p>
              </div>
            )}

            {/* Searching */}
            {live && effectiveStatus === 'searching' && (
              <p className="text-[11px] text-yellow-400/60">
                Bridge connected — scanning for {selectedDevice === 'eego' ? 'LSL stream' : 'Unicorn'}…
              </p>
            )}

            {/* Connected */}
            {live && effectiveStatus === 'connected' && eegStreamInfo && (
              <div className="grid grid-cols-3 gap-2">
                {[['Device', eegStreamInfo.name], ['Channels', eegStreamInfo.channels], ['Rate', `${eegStreamInfo.srate} Hz`]].map(([label, val]) => (
                  <div key={label} className="bg-white/[0.03] rounded-lg px-2.5 py-2">
                    <p className="text-[10px] text-white/25 mb-0.5">{label}</p>
                    <p className="text-xs text-white/70 font-mono truncate">{val}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Idle instructions */}
            {!live && (
              <div className="space-y-1.5">
                <p className="text-[11px] text-white/25">Toggle on to connect. Run the bridge first:</p>
                <code className="block text-[11px] font-mono bg-white/[0.04] text-white/40 px-2 py-1.5 rounded break-all">
                  {device.bridge}
                </code>
                <p className="text-[10px] text-white/15">Windows: use <span className="text-white/30">python</span> not <span className="text-white/30">python3</span></p>
              </div>
            )}
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
