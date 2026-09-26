import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuta } from '@/state'
import { Badge, Button, Card, Spinner } from '@/components/ui'
import { Ban, Radio, ImageIcon, Activity, ShieldAlert, CircleCheckBig, Clock3, CircleDollarSign, Cpu } from 'lucide-react'
import type { StepEvent } from '@shared/types'
import { cn } from '@/lib/utils'

const KIND_TONE: Record<string, string> = {
  plan: 'text-primary',
  act: 'text-foreground',
  verify: 'text-muted-foreground',
  checkpoint: 'text-warning',
  info: 'text-muted-foreground',
  error: 'text-destructive',
  done: 'text-success'
}

function elapsedLabel(startedAt?: string, finishedAt?: string): string {
  if (!startedAt || !finishedAt) return 'Not recorded'
  const seconds = Math.max(0, Math.round((Date.parse(finishedAt) - Date.parse(startedAt)) / 1000))
  if (!Number.isFinite(seconds)) return 'Not recorded'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainder = seconds % 60
  return hours ? `${hours}h ${minutes}m ${remainder}s` : minutes ? `${minutes}m ${remainder}s` : `${remainder}s`
}

function costLabel(cost?: number): string {
  if (cost === undefined) return 'Not reported'
  if (cost === 0) return '$0.00'
  return cost < 0.01 ? `$${cost.toFixed(4)}` : `$${cost.toFixed(2)}`
}

export function Live({ appId }: { appId?: string }) {
  const { applications, liveSteps, latestShot } = useAuta()
  const [persistedSteps, setPersistedSteps] = useState<StepEvent[]>([])

  const active = useMemo(() => {
    if (appId) return applications.find((a) => a.id === appId)
    return (
      applications.find((a) => a.status === 'paused_checkpoint') ??
      applications.find((a) => a.status === 'running') ??
      applications[0]
    )
  }, [appId, applications])

  useEffect(() => {
    let disposed = false
    if (!active) {
      setPersistedSteps([])
      return
    }
    void window.auta.listApplicationEvents(active.id).then((events) => {
      if (!disposed) setPersistedSteps(events)
    })
    return () => { disposed = true }
  }, [active?.id])

  const steps = useMemo(() => {
    if (!active) return []
    const combined = [...persistedSteps, ...(liveSteps[active.id] ?? [])]
    const unique = new Map(combined.map((event) => [
      `${event.ts}:${event.kind}:${event.text}`,
      event
    ]))
    return Array.from(unique.values()).sort((a, b) => a.ts.localeCompare(b.ts))
  }, [active, liveSteps, persistedSteps])
  const shot = active
    ? active.status === 'submitted' && active.screenshotPath
      ? `file://${active.screenshotPath}`
      : latestShot[active.id] || (active.screenshotPath ? `file://${active.screenshotPath}` : undefined)
    : undefined
  const logRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [steps.length])

  if (!active) {
    return (
      <div className="relative flex h-full flex-col items-center justify-center gap-3 overflow-hidden text-muted-foreground">
        <div className="surface-grid pointer-events-none absolute inset-0 opacity-40" />
        <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary"><Radio className="h-6 w-6 text-primary" /></div>
        <div className="relative text-center"><p className="text-sm font-semibold text-foreground">No run in progress</p><p className="mt-1 text-xs">Start an application from the workbench to see each agent step here.</p></div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col px-8 pb-8 pt-12">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-primary">
            {active.status === 'submitted'
              ? <CircleCheckBig className="h-3.5 w-3.5 text-success" />
              : <span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-50" /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" /></span>}
            {active.status === 'submitted' ? 'SUBMISSION RECEIPT' : 'LIVE RUN'}
          </div>
          <h1 className="font-display text-[2rem] font-bold tracking-[-0.04em]">
            {active.status === 'submitted' ? 'Application receipt' : 'Agent workspace'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {active.job.title || active.job.url} · {active.job.company}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={active.status === 'submitted' ? 'success' : active.status === 'paused_checkpoint' ? 'warning' : 'primary'}>
            {(active.status === 'running' || active.status === 'paused_checkpoint') && <Spinner className="h-3 w-3" />}
            {active.status}
          </Badge>
          {(active.status === 'running' || active.status === 'paused_checkpoint') && (
            <Button size="sm" variant="outline" onClick={() => window.auta.cancelApply(active.id)}>
              <Ban className="h-3.5 w-3.5" /> Cancel
            </Button>
          )}
        </div>
      </div>

      {active.status === 'submitted' && (
        <div className="mb-4 grid grid-cols-3 gap-3">
          <Card className="flex items-center gap-3 px-4 py-3">
            <Clock3 className="h-4 w-4 text-primary" />
            <div><div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Elapsed time</div><div className="text-sm font-bold">{elapsedLabel(active.startedAt, active.finishedAt)}</div></div>
          </Card>
          <Card className="flex items-center gap-3 px-4 py-3">
            <CircleDollarSign className="h-4 w-4 text-primary" />
            <div><div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">AI cost</div><div className="text-sm font-bold">{costLabel(active.aiCostUsd)}</div></div>
          </Card>
          <Card className="flex items-center gap-3 px-4 py-3">
            <Cpu className="h-4 w-4 text-primary" />
            <div><div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Model tokens</div><div className="text-sm font-bold">{((active.aiInputTokens ?? 0) + (active.aiOutputTokens ?? 0)).toLocaleString()}</div></div>
          </Card>
        </div>
      )}

      {active.status === 'paused_checkpoint' && (
        <div className="mb-4 flex items-center gap-3 rounded-[var(--radius-card)] bg-warning/12 px-4 py-3 text-warning"><ShieldAlert className="h-4 w-4" /><span className="text-sm font-semibold">Agent paused safely</span><span className="text-xs text-warning/75">Complete the checkpoint to continue this run.</span></div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.55fr)_minmax(20rem,0.8fr)] gap-4 overflow-hidden">
        <Card className="relative flex min-w-0 items-center justify-center overflow-hidden p-3">
          <div className="absolute left-4 top-4 z-10 flex items-center gap-2 rounded-full bg-background/85 px-3 py-1.5 text-[10px] font-semibold text-muted-foreground shadow-sm"><Activity className="h-3 w-3 text-primary" /> {active.status === 'submitted' ? 'CONFIRMED SUCCESS PAGE' : 'LATEST FRAME'}</div>
          {shot ? (
            <img src={shot} alt="Latest application browser frame" className="max-h-full max-w-full rounded-[0.75rem] object-contain" />
          ) : (
            <div className="flex flex-col items-center gap-2 text-muted-foreground/50">
              <ImageIcon className="h-10 w-10" />
              <span className="text-xs">Waiting for first frame…</span>
            </div>
          )}
        </Card>

        <Card className="flex min-w-0 flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 text-xs font-semibold text-muted-foreground">
            <span>{active.status === 'submitted' ? 'Persistent run log' : 'Agent activity'}</span><span className="mono text-[9px]">{steps.length} EVENTS</span>
          </div>
          <div ref={logRef} className="flex-1 space-y-2 overflow-y-auto bg-background/45 p-3 font-mono text-[10px] leading-relaxed">
            {steps.map((s, i) => (
              <div key={i} className="grid grid-cols-[4.5rem_4rem_minmax(0,1fr)] gap-2 rounded-md px-2 py-1.5 hover:bg-secondary/60">
                <span className="shrink-0 text-muted-foreground/45">{new Date(s.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                <span className={cn('uppercase shrink-0 font-semibold', KIND_TONE[s.kind])}>{s.kind}</span>
                <span className="break-words text-foreground/85">{s.text}</span>
              </div>
            ))}
            {steps.length === 0 && <div className="text-muted-foreground/50">No steps yet…</div>}
          </div>
        </Card>
      </div>
    </div>
  )
}
