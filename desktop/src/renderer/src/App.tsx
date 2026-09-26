import { useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  Activity, BadgeIndianRupee, BookOpenCheck, BriefcaseBusiness, CalendarDays,
  ChartNoAxesCombined, ChevronDown, ClipboardCheck, CreditCard, FlaskConical,
  GraduationCap, Headphones, Home as HomeIcon, Landmark, LibraryBig, ListChecks,
  Mic2, Network, Presentation, Route, Send, Settings as SettingsIcon,
  Sparkles, Telescope, UserRound, WalletCards, WifiOff
} from 'lucide-react'
import { useAuta } from '@/state'
import { useSage } from '@/sage/state'
import { SignIn } from '@/routes/SignIn'
import { SageOnboarding } from '@/routes/SageOnboarding'
import { Campus, CampusProvider, Pricing } from '@/routes/Campus'
import { ExamPrep } from '@/routes/ExamPrep'
import { Academics, BitsomPrep } from '@/routes/Academics'
import { Ask } from '@/routes/Ask'
import { AutoApply } from '@/routes/AutoApply'
import { Account } from '@/routes/Account'
import { CheckpointModal } from '@/components/CheckpointModal'
import { Brand, BrandMark } from '@/components/Brand'
import { Badge, Button, Spinner } from '@/components/ui'
import { cn } from '@/lib/utils'

type View = string

export function App() {
  const { auth, me, onboarded, loadingError, refreshMe, setAuth } = useSage()
  const { ready, applications, checkpoints } = useAuta()
  const [demoMode, setDemoMode] = useState(false)
  const [view, setView] = useState<View>('home')
  const [openGroups, setOpenGroups] = useState<string[]>(['Overview'])
  const [editOnboarding, setEditOnboarding] = useState(false)
  const reduceMotion = useReducedMotion()

  if (demoMode) return <div className="flex h-full"><aside className="flex w-56 shrink-0 flex-col gap-3 bg-card p-4 pt-10"><Brand /><Badge tone="warning">BITSoM 2026 demo</Badge><Button variant="outline" onClick={() => setView('home')}>Attendance & timetable</Button><Button variant="outline" onClick={() => setView('exam')}>Cue cards & quiz</Button><Button variant="outline" onClick={() => setView('apply')}>Real AutA data</Button><Button className="mt-auto" onClick={() => setDemoMode(false)}>Sign in with Google</Button></aside><main className="min-w-0 flex-1">{view === 'exam' ? <BitsomPrep /> : view === 'apply' ? <AutoApply /> : <div className="h-full overflow-auto p-8 pt-12"><Academics /></div>}</main></div>
  if (!auth || !ready || (auth.status === 'signed_in' && (me === null || onboarded === null))) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <BrandMark size="lg" />
        {loadingError ? <><p role="alert" className="max-w-md text-sm text-destructive">{loadingError}</p><Button onClick={() => void refreshMe()}>Retry account loading</Button><Button variant="outline" onClick={async () => setAuth(await window.sage.signOut())}>Return to sign-in</Button></> : <><Spinner className="h-5 w-5 text-primary" /><p className="text-sm text-muted-foreground">Loading your account…</p></>}
      </div>
    )
  }
  if (auth.status !== 'signed_in') return <SignIn onDemo={() => setDemoMode(true)} />
  if (!onboarded || editOnboarding) return <SageOnboardingGate onDone={() => setEditOnboarding(false)} />

  const agentBusy = applications.filter((a) => a.status === 'running' || a.status === 'paused_checkpoint').length
  const groups = [
    {label:'Overview',items:[['home','Home',HomeIcon],['pricing','Plans',CreditCard]]},
    {label:'Placements',items:[['jobs','On-campus jobs',BriefcaseBusiness],['apply','Auto-Apply',Send],['interview','Interview AI',Mic2]]},
    {label:'Academics',items:[['timetable','Timetable',CalendarDays],['attendance','Attendance',ChartNoAxesCombined],['class_recommendations','Class priorities',BookOpenCheck]]},
    {label:'Growth plan',items:[['semester','Semester plan',Route],['progress','Daily progress',ListChecks],['activity','Activity planner',Activity]]},
    {label:'Pending work',items:[['assignments','Assignments',ClipboardCheck],['fees','Fees',WalletCards]]},
    {label:'Exam prep',items:[['exam','Quick Notes',LibraryBig],['study','Study AI',Headphones],['library','Cue-card library',GraduationCap]]},
    {label:'Exposure',items:[['internships','Internships',Telescope],['workshops','Workshops',Presentation],['research','Faculty projects',FlaskConical],['networking','Industry network',Network]]},
    {label:'SAGE',items:[['ask','Ask SAGE',Sparkles],['settings','Account',UserRound]]}
  ]

  return (
    <CampusProvider><div className="app-frame flex h-full min-w-[60rem]">
      <aside className="nav-rail relative flex w-[17rem] shrink-0 flex-col shadow-[var(--shadow-rail)]">
        <div className="drag px-5 pb-4 pt-9">
          <div className="no-drag"><Brand /></div>
          <div className="mt-5 flex items-center gap-2 rounded-xl bg-white/[0.055] px-3 py-2.5 text-xs text-white/70">
            <Landmark className="h-3.5 w-3.5 text-primary" /> BITSoM · MBA 2026
          </div>
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-3" aria-label="Primary">
          {groups.map((group)=><details key={group.label} className="nav-group" open={group.items.some(([id])=>id===view) || openGroups.includes(group.label)} onToggle={(event)=>{
            const isOpen=event.currentTarget.open
            setOpenGroups((current)=>isOpen?[...new Set([...current,group.label])]:current.filter((label)=>label!==group.label))
          }}>
            <summary><span>{group.label}</span><ChevronDown className="h-3.5 w-3.5 transition-transform" /></summary>
            <div className="space-y-0.5 pb-2">{group.items.map(([id,label,Icon])=><button key={id as string} onClick={()=>setView(id as string)} aria-current={view===id?'page':undefined} className={cn('nav-item no-drag',view===id&&'is-active')}>
              <Icon className="h-[1.05rem] w-[1.05rem] shrink-0" />
              <span className="min-w-0 flex-1 truncate">{label as string}</span>
              {id==='apply'&&agentBusy>0&&<Badge className="ml-auto">{agentBusy}</Badge>}
            </button>)}</div>
          </details>)}
        </nav>
        <div className="mt-auto space-y-3 border-t border-white/[0.07] p-3">
          {checkpoints.length > 0 && (
            <button onClick={() => setView('apply')} className="flex w-full items-center gap-2 rounded-[var(--radius-input)] bg-warning/15 px-3 py-3 text-left text-xs font-semibold text-warning no-drag">
              <span className="relative flex h-2 w-2 shrink-0"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-warning opacity-50" /><span className="relative inline-flex h-2 w-2 rounded-full bg-warning" /></span>
              {checkpoints.length} application step{checkpoints.length > 1 ? 's' : ''} need you
            </button>
          )}
          <div className="account-dock flex items-center gap-3 rounded-xl p-3 text-[11px]">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/20 font-bold text-primary">{(me?.user.full_name ?? me?.user.email ?? 'S').slice(0,1).toUpperCase()}</div>
            <div className="min-w-0 flex-1"><div className="truncate font-semibold text-white">{me?.user.full_name ?? me?.user.email}</div>
            <div className="truncate text-white/45">{me?.subscription?.plan_name ?? '—'}{auth.dev ? ' · DEV' : ''}</div></div>
            <SettingsIcon className="h-3.5 w-3.5 text-white/35" />
          </div>
          <p className="mono px-1 text-[9px] leading-relaxed text-white/25">SAGE AI DESKTOP 1.0.0<br />AUTO-APPLY RUNS LOCALLY</p>
        </div>
      </aside>

      <main className="app-canvas relative min-w-0 flex-1 overflow-hidden">
        <div className="drag absolute inset-x-0 top-0 z-10 h-9" />
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={view} className="h-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0.1 : 0.18, ease: [0.16, 1, 0.3, 1] }}>
            {!['exam','study','library','ask','apply','settings','pricing'].includes(view) && <Campus key={view} view={view === 'home' ? 'dashboard' : view} />}
            {view === 'pricing' && <Pricing />}
            {['exam','study'].includes(view) && <ExamPrep voice={view==='study'} />}
            {view === 'library' && <BitsomPrep />}
            {view === 'ask' && <Ask />}
            {view === 'apply' && <AutoApply />}
            {view === 'settings' && <Account onEditOnboarding={() => setEditOnboarding(true)} />}
          </motion.div>
        </AnimatePresence>
      </main>
      <CheckpointModal />
    </div></CampusProvider>
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
