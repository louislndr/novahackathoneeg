import { memo } from 'react'
import { motion } from 'framer-motion'
import { Plus, RefreshCw } from 'lucide-react'

function TopBar({ eegMode, gazeEnabled, onNewSession, onRecalibrate }) {
  return (
    <header className="app-topbar h-14 flex-shrink-0 border-b border-white/[0.08] flex items-center px-5 gap-4">
      <div className="flex-1 flex items-center gap-3">
        {gazeEnabled && (
          <motion.button
            onClick={onRecalibrate}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.96 }}
            className="btn-ghost"
          >
            <RefreshCw size={13} />
            Recalibrate
          </motion.button>
        )}
        {eegMode === 'simulated' && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 font-medium">
            Simulated EEG
          </span>
        )}
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

export default memo(TopBar)
