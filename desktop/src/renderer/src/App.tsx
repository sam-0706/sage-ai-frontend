import { useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Home as HomeIcon, Layers, MessageCircle, Send, Settings as SettingsIcon, WifiOff } from 'lucide-react'
import { useAuta } from '@/state'
import { useSage } from '@/sage/state'
import { SignIn } from '@/routes/SignIn'
import { SageOnboarding } from '@/routes/SageOnboarding'
import { Home } from '@/routes/Home'
import { ExamPrep } from '@/routes/ExamPrep'
import { Ask } from '@/routes/Ask'
import { AutoApply } from '@/routes/AutoApply'
import { Account } from '@/routes/Account'
import { CheckpointModal } from '@/components/CheckpointModal'
import { Brand, BrandMark } from '@/components/Brand'
import { Badge, Button, Spinner } from '@/components/ui'
import { cn } from '@/lib/utils'

type View = 'home' | 'exam' | 'ask' | 'apply' | 'settings'

export function App() {
  const { auth, me, onboarded } = useSage()
  const { ready, applications, checkpoints } = useAuta()
  const [view, setView] = useState<View>('home')
  const [editOnboarding, setEditOnboarding] = useState(false)
  const reduceMotion = useReducedMotion()

  if (!auth || !ready || (auth.status === 'signed_in' && (me === null || onboarded === null))) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <BrandMark size="lg" />
        <Spinner className="h-5 w-5 text-primary" />
      </div>
    )
  }
  if (auth.status !== 'signed_in') return <SignIn />
  if (!onboarded || editOnboarding) return <SageOnboardingGate onDone={() => setEditOnboarding(false)} />

  const agentBusy = applications.filter((a) => a.status === 'running' || a.status === 'paused_checkpoint').length
  const nav: { id: View; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'home', label: 'Home', icon: <HomeIcon className="h-4 w-4" /> },
    { id: 'exam', label: 'Exam prep', icon: <Layers className="h-4 w-4" /> },
    { id: 'ask', label: 'Ask SAGE', icon: <MessageCircle className="h-4 w-4" /> },
    { id: 'apply', label: 'Auto apply', icon: <Send className="h-4 w-4" />, badge: agentBusy || undefined },
    { id: 'settings', label: 'Settings', icon: <SettingsIcon className="h-4 w-4" /> }
  ]

  return (
    <div className="flex h-full min-w-[60rem]">
      <aside className="relative flex w-56 shrink-0 flex-col bg-card/75 shadow-[var(--shadow-rail)]">
        <div className="drag px-5 pb-6 pt-9"><div className="no-drag"><Brand /></div></div>
        <nav className="flex flex-col gap-1.5 px-3" aria-label="Primary">
          {nav.map((n) => (
            <button key={n.id} onClick={() => setView(n.id)} aria-current={view === n.id ? 'page' : undefined}
              className={cn('group relative flex h-11 items-center gap-3 rounded-[var(--radius-input)] px-3 text-sm font-semibold transition-colors no-drag',
                view === n.id ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/70 hover:text-foreground')}>
              <span className={cn('absolute inset-y-3 left-0 w-0.5 rounded-full bg-primary transition-opacity', view === n.id ? 'opacity-100' : 'opacity-0')} />
              {n.icon}{n.label}
              {n.badge ? <Badge tone="primary" className="ml-auto">{n.badge}</Badge> : null}
            </button>
          ))}
        </nav>
        <div className="mt-auto space-y-3 p-3">
          {checkpoints.length > 0 && (
            <button onClick={() => setView('apply')} className="flex w-full items-center gap-2 rounded-[var(--radius-input)] bg-warning/15 px-3 py-3 text-left text-xs font-semibold text-warning no-drag">
              <span className="relative flex h-2 w-2 shrink-0"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-warning opacity-50" /><span className="relative inline-flex h-2 w-2 rounded-full bg-warning" /></span>
              {checkpoints.length} application step{checkpoints.length > 1 ? 's' : ''} need you
            </button>
          )}
          <div className="rounded-[var(--radius-input)] bg-background/55 p-3 text-[11px]">
            <div className="truncate font-semibold">{me?.user.full_name ?? me?.user.email}</div>
            <div className="truncate text-muted-foreground">{me?.subscription?.plan_name ?? '—'}{auth.dev ? ' · DEV' : ''}</div>
          </div>
          <p className="mono px-1 text-[9px] leading-relaxed text-muted-foreground/55">SAGE AI DESKTOP 1.0.0<br />AUTO-APPLY RUNS LOCALLY</p>
        </div>
      </aside>

      <main className="relative flex-1 overflow-hidden">
        <div className="drag absolute inset-x-0 top-0 z-10 h-9" />
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={view} className="h-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0.1 : 0.18, ease: [0.16, 1, 0.3, 1] }}>
            {view === 'home' && <Home go={setView} />}
            {view === 'exam' && <ExamPrep />}
            {view === 'ask' && <Ask />}
            {view === 'apply' && <AutoApply />}
            {view === 'settings' && <Account onEditOnboarding={() => setEditOnboarding(true)} />}
          </motion.div>
        </AnimatePresence>
      </main>
      <CheckpointModal />
    </div>
  )
}

function SageOnboardingGate({ onDone }: { onDone: () => void }) {
  const { onboarded } = useSage()
  return (
    <div className="relative h-full">
      <SageOnboarding />
      {onboarded && <Button variant="ghost" size="sm" className="absolute right-6 top-10" onClick={onDone}>Close</Button>}
    </div>
  )
}

export function OfflineBanner() {
  return <div className="flex items-center gap-2 bg-warning/15 px-4 py-2 text-xs text-warning"><WifiOff className="h-3.5 w-3.5" /> Offline — some features are unavailable.</div>
}
