import { motion } from 'framer-motion'
import { Plus } from 'lucide-react'

const PHASE_INFO = {
  idle:     { label: 'No active session', dot: false, color: 'text-white/25' },
  round1:   { label: 'Round 1 · Baseline running', dot: true, color: 'text-yellow-400' },
  between:  { label: 'Between rounds', dot: false, color: 'text-white/40' },
  round2:   { label: 'Round 2 · Adaptive running', dot: true, color: 'text-mint-500' },
  complete: { label: 'Session complete', dot: false, color: 'text-mint-500' },
}

export default function TopBar({ phase, eegMode, onNewSession }) {
  const info = PHASE_INFO[phase] ?? PHASE_INFO.idle

  return (
    <header className="h-14 flex-shrink-0 bg-[#111111] border-b border-white/[0.05] flex items-center px-5 gap-4">
      <div className="flex-1" />

      <div className="flex items-center gap-2">
        {info.dot && (
          <motion.span
            animate={{ opacity: [1, 0.25, 1] }}
            transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }}
            className="w-1.5 h-1.5 rounded-full bg-current inline-block"
            style={{ color: phase === 'round2' ? '#00e5a0' : '#facc15' }}
          />
        )}
        <span className={`text-[13px] font-medium ${info.color}`}>{info.label}</span>

        {eegMode === 'simulated' && (
          <span className="ml-2 text-[11px] px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 font-medium">
            Simulated EEG
          </span>
        )}
      </div>

      <motion.button
        onClick={onNewSession}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.96 }}
        className="btn-ghost"
        aria-label="Start new session"
      >
        <Plus size={14} />
        New session
      </motion.button>
    </header>
  )
}
