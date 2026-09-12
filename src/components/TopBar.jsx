import { motion } from 'framer-motion'
import { Plus, Activity } from 'lucide-react'
import { formatMsLive } from '../App'

export default function TopBar({ sessionActive, elapsed, eegMode, gazeEnabled, onNewSession }) {
  return (
    <header className="h-14 flex-shrink-0 bg-[#111111] border-b border-white/[0.05] flex items-center px-5 gap-4">
      <div className="flex-1 flex items-center gap-3">
        {sessionActive && (
          <motion.div
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-2"
          >
            <motion.span
              animate={{ opacity: [1, 0.25, 1] }}
              transition={{ repeat: Infinity, duration: 1.5 }}
              className="w-1.5 h-1.5 rounded-full bg-mint-500"
            />
            <span className="text-[13px] font-mono text-white/50">{formatMsLive(elapsed)}</span>
          </motion.div>
        )}

        <div className="flex items-center gap-2">
          {eegMode === 'simulated' && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 font-medium">
              Simulated EEG
            </span>
          )}
          {gazeEnabled && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/20 font-medium">
              Eye tracking on
            </span>
          )}
        </div>
      </div>

      <motion.button
        onClick={onNewSession}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.96 }}
        className="btn-ghost"
      >
        <Plus size={14} />
        New session
      </motion.button>
    </header>
  )
}
