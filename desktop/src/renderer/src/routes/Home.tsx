import { useCallback, useEffect, useState } from 'react'
import { ArrowRight, CalendarClock, CheckCircle2, Compass, Layers, Send, Sparkles, TriangleAlert } from 'lucide-react'
import { api, errorMessage, type CallState } from '@/sage/api'
import { useSage } from '@/sage/state'
import { useAuta } from '@/state'
import { Badge, Button, Card, Spinner } from '@/components/ui'
import { CallPanel } from '@/components/CallPanel'
import { Page } from '@/routes/ExamPrep'
import { cn } from '@/lib/utils'
import { Academics } from './Academics'

interface Intervention {
  id: string
  status: string
  title: string
  reason: string
  confidence: number | null
  is_fallback: boolean
  evidence: { fact: string; source: string }[]
  missing_info: string[]
  next_items: { title: string; reason: string }[]
}
interface Plan {
  id: string
  status: string
  summary: string
  root_cause: string | null
  actions: { action: string; owner: string; due_date: string | null }[]
  risk_level: string | null
  due_date: string | null
  escalation: { recommended?: boolean; template_key?: string | null; reason?: string }
}
interface HomeData {
  state: 'needs_setup' | 'attention_needed' | 'refresh_available'
  priority: Intervention | null
  draft_plans: Plan[]
  active_plans: Plan[]
  active_signal_count: number
}

export function Home({ go }: { go: (view: 'exam' | 'ask' | 'apply' | 'settings') => void }) {
  const { me } = useSage()
  const { applications } = useAuta()
  const [data, setData] = useState<HomeData | null>(null)
  const [due, setDue] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [showCall, setShowCall] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const [h, o] = await Promise.all([api.get<HomeData>('/v1/home'), api.get<{ due_now: number }>('/v1/exam-prep/overview')])
      setData(h)
      setDue(o.due_now)
    } catch (e) {
      setError(errorMessage(e))
    }
  }, [])
  useEffect(() => { void load() }, [load])

  const prioritize = async () => {
    setBusy(true)
    setError('')
    try {
      const r = await api.post<{ state: string; message?: string }>('/v1/interventions/prioritize')
      if (r.state === 'on_track') setError(r.message ?? 'You are on track.')
      await load()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const accept = async (id: string) => {
    await api.post(`/v1/plans/${id}/accept`)
    await load()
  }

  const first = me?.user.full_name?.split(' ')[0]
  const submitted = applications.filter((a) => a.status === 'submitted').length
  const p = data?.priority

  return (
    <Page title={`Good to see you${first ? `, ${first}` : ''}`} subtitle="One clear priority, a plan you agree to, and help when you need it.">
      <div className="grid gap-3 sm:grid-cols-3">
        <Tile icon={<Layers className="h-4 w-4" />} label="Cards due" value={due ?? '…'} onClick={() => go('exam')} />
        <Tile icon={<Send className="h-4 w-4" />} label="Applications submitted" value={submitted} onClick={() => go('apply')} />
        <Tile icon={<CalendarClock className="h-4 w-4" />} label="Voice minutes left"
          value={me?.subscription ? Math.floor(me.subscription.voice.remaining_seconds / 60) : '…'} onClick={() => go('settings')} />
      </div>

      <Academics />
      <Card className="space-y-4 p-6">
        <div className="flex items-start justify-between gap-4">
          <h2 className="flex items-center gap-2 text-lg font-bold"><Compass className="h-5 w-5 text-primary" /> Today's priority</h2>
          <Button variant={p ? 'outline' : 'default'} size="sm" onClick={prioritize} loading={busy}><Sparkles className="h-4 w-4" /> {p ? 'Re-check' : 'Find my priority'}</Button>
        </div>
        {!data ? (error ? <Button variant="outline" onClick={() => void load()}>Retry loading priority</Button> : <Spinner className="text-primary" />) : data.state === 'needs_setup' ? (
          <p className="text-sm text-muted-foreground">Add a signal (a deadline, attendance figure or goal progress) in Settings → Profile, or load a labelled demo profile, and SAGE will pick what matters first.</p>
        ) : !p ? (
          <p className="text-sm text-muted-foreground">Ask SAGE to review your signals and pick the one thing that deserves attention.</p>
        ) : (
          <div className="space-y-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-xl font-bold">{p.title}</h3>
                {p.confidence !== null && <Badge tone="muted">confidence {Math.round(p.confidence * 100)}%</Badge>}
                {p.is_fallback && <Badge tone="warning">rules only</Badge>}
              </div>
              <p className="mt-2 whitespace-normal text-sm leading-relaxed">{p.reason}</p>
            </div>
            <div className="grid gap-3 text-xs sm:grid-cols-2">
              <div className="rounded-[var(--radius-input)] bg-background/60 p-3">
                <div className="mb-1.5 font-semibold">Evidence</div>
                <ul className="space-y-1 text-muted-foreground">{p.evidence.map((e, i) => <li key={i} className="whitespace-normal">• {e.fact} <span className="mono text-[10px] opacity-70">[{e.source}]</span></li>)}</ul>
              </div>
              {p.missing_info.length > 0 && (
                <div className="rounded-[var(--radius-input)] bg-warning/10 p-3">
                  <div className="mb-1.5 flex items-center gap-1.5 font-semibold text-warning"><TriangleAlert className="h-3.5 w-3.5" /> Would help to know</div>
                  <ul className="space-y-1 text-muted-foreground">{p.missing_info.map((m, i) => <li key={i} className="whitespace-normal">• {m}</li>)}</ul>
                </div>
              )}
            </div>
            {p.next_items.length > 0 && <p className="text-xs text-muted-foreground">Next up: {p.next_items.map((n) => n.title).join(' · ')}</p>}
            {!showCall ? (
              <Button onClick={() => setShowCall(true)}>Talk it through with an AI check-in <ArrowRight className="h-4 w-4" /></Button>
            ) : (
              <CallPanel
                title="AI check-in"
                preflightPath={`/v1/calls/preflight?intervention_id=${p.id}`}
                createPath="/v1/calls"
                createBody={{ intervention_id: p.id }}
                pollPath={(id) => `/v1/calls/${id}`}
                retryPath={(id) => `/v1/calls/${id}/extract`}
                isAnalysed={(c: CallState) => !!c.plan}
                onDone={() => { setShowCall(false); void load() }}
              />
            )}
          </div>
        )}
        {error && <p className="text-sm text-muted-foreground" role="status">{error}</p>}
      </Card>

      {data && [...data.draft_plans, ...data.active_plans].length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-bold">Your plans</h2>
          {[...data.draft_plans, ...data.active_plans].map((pl) => (
            <Card key={pl.id} className="space-y-3 p-5">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 whitespace-normal text-sm font-semibold">{pl.summary}</p>
                <Badge tone={pl.status === 'draft' ? 'warning' : 'success'}>{pl.status === 'draft' ? 'Review needed' : 'Accepted'}</Badge>
              </div>
              {pl.root_cause && <p className="whitespace-normal text-xs text-muted-foreground">Root cause: {pl.root_cause}</p>}
              <ul className="space-y-1.5 text-sm">
                {pl.actions.map((a, i) => (
                  <li key={i} className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span className="whitespace-normal">{a.action}{a.due_date && <span className="ml-2 text-xs text-muted-foreground">by {a.due_date}</span>}</span></li>
                ))}
              </ul>
              {pl.escalation?.recommended && pl.escalation.template_key && (
                <p className="text-xs text-muted-foreground">Suggested support: <span className="font-semibold">{pl.escalation.template_key.replace(/_/g, ' ')}</span> — {pl.escalation.reason}</p>
              )}
              {pl.status === 'draft' && <div className="flex gap-2"><Button size="sm" onClick={() => void accept(pl.id)}>Accept plan</Button></div>}
            </Card>
          ))}
        </section>
      )}
    </Page>
  )
}

function Tile({ icon, label, value, onClick }: { icon: React.ReactNode; label: string; value: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="text-left no-drag">
      <Card className={cn('p-4 transition-colors hover:bg-secondary/60')}>
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">{icon}{label}</div>
        <div className="mt-2 font-display text-2xl font-bold">{value}</div>
      </Card>
    </button>
  )
}
