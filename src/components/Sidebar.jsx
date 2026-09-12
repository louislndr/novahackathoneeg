import { motion } from 'framer-motion'
import { Monitor, FileText, Radio, Activity, Brain, Eye } from 'lucide-react'

const NAV = [
  { id: 'study', label: 'Live Study', icon: Monitor },
  { id: 'results', label: 'Friction Report', icon: FileText },
  { id: 'signal', label: 'Signal Setup', icon: Radio },
]

export default function Sidebar({ screen, setScreen, sessionActive, hasResults, eegMode, gazeEnabled }) {
  return (
    <aside className="app-sidebar w-52 flex-shrink-0 border-r border-white/[0.08] flex flex-col">
      <div className="h-14 flex items-center px-4 border-b border-white/[0.05]">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-brand-500 flex items-center justify-center shadow-lg shadow-brand-500/25">
            <Activity size={14} strokeWidth={2.5} className="text-[#1d100c]" />
          </div>
          <span className="font-semibold text-[15px] tracking-tight font-display">FrictionFix</span>
        </div>
      </div>

      <nav className="flex-1 px-2.5 py-4 space-y-0.5">
        {NAV.map(({ id, label, icon: Icon }) => {
          const active = screen === id
          const disabled = id === 'results' && !hasResults

          return (
            <motion.button
              key={id}
              onClick={() => !disabled && setScreen(id)}
              whileHover={!disabled ? { x: 2 } : {}}
              whileTap={!disabled ? { scale: 0.97 } : {}}
              aria-current={active ? 'page' : undefined}
              className={[
                'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150',
                active ? 'bg-brand-500/[0.1] text-white'
                  : disabled ? 'text-white/20 cursor-not-allowed'
                  : 'text-white/45 hover:text-white/75 hover:bg-white/[0.04] cursor-pointer',
              ].join(' ')}
            >
              <Icon size={15} className={active ? 'text-brand-500' : ''} />
              {label}
              {id === 'study' && sessionActive && (
                <motion.span
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ repeat: Infinity, duration: 1.6 }}
                  className="ml-auto w-1.5 h-1.5 rounded-full bg-brand-500"
                />
              )}
            </motion.button>
          )
        })}
      </nav>

      {/* Signals status */}
      <div className="px-4 py-3 border-t border-white/[0.05] space-y-2">
        <p className="text-[11px] font-medium text-white/25">Signals</p>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-white/35 text-xs">
            <Brain size={11} />
            EEG
          </div>
          <span className={`text-[11px] font-medium ${eegMode === 'simulated' ? 'text-brand-400' : 'text-white/20'}`}>
            {eegMode === 'simulated' ? 'Simulated' : 'Off'}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-white/35 text-xs">
            <Eye size={11} />
            Eye tracking
          </div>
          <span className={`text-[11px] font-medium ${gazeEnabled ? 'text-brand-500' : 'text-white/20'}`}>
            {gazeEnabled ? 'Active' : 'Off'}
          </span>
        </div>
      </div>

      <div className="px-4 py-3 border-t border-white/[0.05]">
        <p className="text-[11px] text-white/15">v0.2.0 · Demo</p>
      </div>
    </aside>
  )
}
