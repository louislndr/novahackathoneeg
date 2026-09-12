import { motion } from 'framer-motion'
import { FlaskConical, BarChart3, Radio, Activity } from 'lucide-react'

const NAV = [
  { id: 'study', label: 'Study', icon: FlaskConical },
  { id: 'results', label: 'Results', icon: BarChart3 },
  { id: 'signal', label: 'Signal Setup', icon: Radio },
]

export default function Sidebar({ screen, setScreen, phase }) {
  const resultsEnabled = phase === 'complete'

  return (
    <aside className="w-52 flex-shrink-0 bg-[#111111] border-r border-white/[0.05] flex flex-col">
      <div className="h-14 flex items-center px-4 border-b border-white/[0.05]">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-mint-500 flex items-center justify-center shadow-lg shadow-mint-500/20">
            <Activity size={14} strokeWidth={2.5} className="text-[#0d0d0d]" />
          </div>
          <span className="font-semibold text-[15px] tracking-tight">FrictionFix</span>
        </div>
      </div>

      <nav className="flex-1 px-2.5 py-4 space-y-0.5">
        {NAV.map(({ id, label, icon: Icon }) => {
          const active = screen === id
          const disabled = id === 'results' && !resultsEnabled

          return (
            <motion.button
              key={id}
              onClick={() => !disabled && setScreen(id)}
              whileHover={!disabled ? { x: 2 } : {}}
              whileTap={!disabled ? { scale: 0.97 } : {}}
              aria-current={active ? 'page' : undefined}
              aria-disabled={disabled}
              className={[
                'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-colors duration-150',
                active
                  ? 'bg-white/[0.07] text-white'
                  : disabled
                  ? 'text-white/20 cursor-not-allowed'
                  : 'text-white/45 hover:text-white/75 hover:bg-white/[0.04] cursor-pointer',
              ].join(' ')}
            >
              <Icon size={15} className={active ? 'text-mint-500' : ''} />
              {label}
              {id === 'results' && !resultsEnabled && (
                <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-white/[0.04] text-white/20">—</span>
              )}
            </motion.button>
          )
        })}
      </nav>

      <div className="px-4 py-3 border-t border-white/[0.05]">
        <p className="text-[11px] text-white/15 font-mono">v0.1.0 · Demo</p>
      </div>
    </aside>
  )
}
