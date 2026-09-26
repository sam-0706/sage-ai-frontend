import { useEffect, useState } from 'react'
import { LayoutDashboard, Radio, SlidersHorizontal, UserRound } from 'lucide-react'
import { useAuta } from '@/state'
import { api } from '@/sage/api'
import { Dashboard } from '@/routes/Dashboard'
import { Live } from '@/routes/Live'
import { Onboarding as CareerProfile } from '@/routes/Onboarding'
import { Settings as AgentSettings } from '@/routes/Settings'
import type { AutaImportReport } from '@shared/sage'
import { Badge } from '@/components/ui'
import { cn } from '@/lib/utils'

type Tab = 'applications' | 'live' | 'profile' | 'agent'

/** The SAGE auto-apply agent, running locally on this desktop with SAGE-hosted models. */
export function AutoApply() {
  const { hasProfile, applications, refreshProfile, checkpoints } = useAuta()
  const [report, setReport] = useState<AutaImportReport | null>(null)
  useEffect(() => { void window.sage.importReport().then(setReport).catch(() => {}) }, [])
  const [tab, setTab] = useState<Tab>(hasProfile ? 'applications' : 'profile')
  const [liveId, setLiveId] = useState<string | undefined>()
  const [quota, setQuota] = useState<{ remaining: number; allowance: number } | null>(null)

  useEffect(() => {
    void api.get<{ quota: { remaining: number; allowance: number } | null }>('/v1/autoapply/status').then((s) => setQuota(s.quota)).catch(() => {})
  }, [applications.length])

  const running = applications.filter((a) => a.status === 'running' || a.status === 'paused_checkpoint').length
  const tabs: { id: Tab; label: string; icon: React.ReactNode; badge?: number; disabled?: boolean }[] = [
    { id: 'applications', label: 'Applications', icon: <LayoutDashboard className="h-4 w-4" />, disabled: !hasProfile },
    { id: 'live', label: 'Live', icon: <Radio className="h-4 w-4" />, badge: running || checkpoints.length || undefined, disabled: !hasProfile },
    { id: 'profile', label: 'Career profile', icon: <UserRound className="h-4 w-4" /> },
    { id: 'agent', label: 'Agent settings', icon: <SlidersHorizontal className="h-4 w-4" /> }
  ]

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1.5 border-b border-border px-8 pt-11">
        {tabs.map((t) => (
          <button key={t.id} disabled={t.disabled} onClick={() => setTab(t.id)} aria-selected={tab === t.id} role="tab"
            className={cn('-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors disabled:opacity-40 no-drag',
              tab === t.id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>
            {t.icon}{t.label}{t.badge ? <Badge tone="primary">{t.badge}</Badge> : null}
          </button>
        ))}
        {quota && <span className="ml-auto pb-2 text-[11px] text-muted-foreground">{quota.remaining.toLocaleString()} / {quota.allowance.toLocaleString()} agent steps left this period</span>}
      </div>
      {report && <div className="border-b border-border px-8 py-3 text-xs text-muted-foreground"><strong className="text-foreground">Real AutA import</strong> · {report.counts.jobs} jobs · {report.counts.applications} applications · {report.counts.application_events} activity events · {report.counts.site_credentials} login records<br />{report.browser}. {report.secrets}.</div>}
      <div className="min-h-0 flex-1">
        {tab === 'applications' && <Dashboard onOpenLive={(id) => { setLiveId(id); setTab('live') }} />}
        {tab === 'live' && <Live appId={liveId} />}
        {tab === 'profile' && <CareerProfile onDone={() => { void refreshProfile(); setTab('applications') }} />}
        {tab === 'agent' && <AgentSettings />}
      </div>
    </div>
  )
}
