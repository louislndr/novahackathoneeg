import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { Activity, Wifi, WifiOff, Loader2, Server } from 'lucide-react'

const CHANNEL_COLORS = [
  '#34d399', '#60a5fa', '#f472b6', '#a78bfa',
  '#fb923c', '#facc15', '#2dd4bf', '#f87171',
  '#c084fc', '#38bdf8', '#4ade80', '#fbbf24',
  '#e879f9', '#22d3ee', '#86efac', '#fca5a5',
  '#d8b4fe', '#7dd3fc', '#6ee7b7', '#fde68a',
  '#f9a8d4', '#a5f3fc', '#bbf7d0', '#fed7aa',
]

function ChannelWave({ index, historyRef, color }) {
  const canvasRef = useRef(null)
  const rafRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    const draw = () => {
      const hist = historyRef.current
      const w = canvas.width
      const h = canvas.height
      ctx.clearRect(0, 0, w, h)

      if (hist.length < 2) {
        rafRef.current = requestAnimationFrame(draw)
        return
      }

      const vals = hist.map(sample => sample[index] ?? 0)
      const min = Math.min(...vals)
      const max = Math.max(...vals)
      const range = max - min || 1

      ctx.strokeStyle = color
      ctx.lineWidth = 1.2
      ctx.shadowColor = color
      ctx.shadowBlur = 3
      ctx.beginPath()
      vals.forEach((v, i) => {
        const x = (i / (vals.length - 1)) * w
        const y = h - ((v - min) / range) * (h - 4) - 2
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      })
      ctx.stroke()
      ctx.shadowBlur = 0

      rafRef.current = requestAnimationFrame(draw)
    }
    rafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafRef.current)
  }, [historyRef, index, color])

  return (
    <canvas
      ref={canvasRef}
      width={180}
      height={36}
      className="w-full h-full"
    />
  )
}

function LoadGauge({ load }) {
  const pct = (load ?? 0) / 100
  const color = pct > 0.7 ? '#f87171' : pct > 0.4 ? '#fbbf24' : '#34d399'
  const circumference = 2 * Math.PI * 40
  const dash = circumference * pct

  return (
    <div className="relative flex items-center justify-center w-28 h-28">
      <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
        <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
        <circle
          cx="50" cy="50" r="40"
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          style={{ transition: 'stroke-dasharray 0.4s ease, stroke 0.4s ease' }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-2xl font-bold tabular-nums leading-none" style={{ color }}>
          {load != null ? Math.round(load) : '—'}
        </span>
        <span className="text-[10px] text-white/30 mt-0.5">cog. load</span>
      </div>
    </div>
  )
}

export default function EEGDataScreen({ eegWsStatus, liveEegLoad, liveEegChannels, eegStreamInfo, eegHistoryRef }) {
  const connected = eegWsStatus === 'connected'
  const searching = eegWsStatus === 'searching'

  const container = { hidden: {}, show: { transition: { staggerChildren: 0.04 } } }
  const item = { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: 0.2 } } }

  const nCh = eegStreamInfo?.channels ?? liveEegChannels.length ?? 24

  return (
    <div className="h-full overflow-auto p-5">
      <motion.div variants={container} initial="hidden" animate="show" className="max-w-4xl mx-auto space-y-4">

        {/* Header */}
        <motion.div variants={item} className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold font-display">EEG Signal</h1>
            <p className="text-white/35 text-sm mt-0.5">Live data from ANT Neuro eego™</p>
          </div>
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium border flex items-center gap-1.5 ${
            connected  ? 'bg-mint-500/10 text-mint-500 border-mint-500/25'
            : searching ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
            : 'bg-white/[0.03] text-white/25 border-white/[0.06]'
          }`}>
            {searching && <Loader2 size={9} className="animate-spin" />}
            {connected ? 'Streaming' : searching ? 'Searching…' : 'Disconnected'}
          </span>
        </motion.div>

        {/* Stream info + load */}
        <motion.div variants={item} className="panel p-5 flex items-center gap-6">
          <LoadGauge load={connected ? liveEegLoad : null} />

          <div className="flex-1 space-y-3">
            {eegStreamInfo ? (
              <>
                <div className="flex items-center gap-2">
                  <Server size={13} className="text-mint-500" />
                  <span className="text-sm font-medium text-white/80">{eegStreamInfo.name}</span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    ['Sample rate', `${eegStreamInfo.srate} Hz`],
                    ['Channels', `${eegStreamInfo.channels}`],
                    ['Host', eegStreamInfo.host],
                  ].map(([label, val]) => (
                    <div key={label}>
                      <p className="text-[10px] text-white/25 mb-0.5">{label}</p>
                      <p className="text-sm text-white/70 font-mono truncate">{val}</p>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="space-y-1.5">
                <p className="text-white/35 text-sm">
                  {searching ? 'Looking for LSL EEG stream on the network…' : 'Enable Live EEG in Signal Setup to connect.'}
                </p>
                {!searching && (
                  <p className="text-white/20 text-xs">Then run: <code className="font-mono bg-white/[0.05] px-1 py-0.5 rounded">python3 bridge.py</code></p>
                )}
              </div>
            )}
          </div>
        </motion.div>

        {/* Channel waveforms */}
        {connected && liveEegChannels.length > 0 && (
          <motion.div variants={item} className="panel p-5">
            <p className="text-[11px] text-white/25 font-medium mb-3">{nCh}-channel EEG · last 10 seconds</p>
            <div className="grid grid-cols-4 gap-3">
              {Array.from({ length: nCh }, (_, i) => (
                <div key={i} className="space-y-1">
                  <p className="text-[10px] text-white/20 font-mono">CH{String(i + 1).padStart(2, '0')}</p>
                  <div className="h-9 bg-white/[0.03] rounded overflow-hidden">
                    <ChannelWave index={i} historyRef={eegHistoryRef} color={CHANNEL_COLORS[i % CHANNEL_COLORS.length]} />
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Not connected placeholder */}
        {!connected && (
          <motion.div variants={item} className="panel p-8 flex flex-col items-center gap-3 text-center">
            {searching
              ? <Loader2 size={28} className="text-yellow-400/50 animate-spin" />
              : <WifiOff size={28} className="text-white/10" />
            }
            <p className="text-white/30 text-sm">
              {searching ? 'Waiting for LSL stream from eego…' : 'No EEG signal'}
            </p>
          </motion.div>
        )}

      </motion.div>
    </div>
  )
}
