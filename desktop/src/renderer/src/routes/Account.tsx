import { useCallback, useEffect, useState } from 'react'
import { LaptopMinimal, LogOut, RefreshCw } from 'lucide-react'
import { api, errorMessage, type Meter } from '@/sage/api'
import { useSage } from '@/sage/state'
import { Badge, Button, Card, Field, Input, Progress, Select, Spinner } from '@/components/ui'
import { Page } from '@/routes/ExamPrep'
import { timeAgo } from '@/lib/utils'

interface DeviceSession { id: string; client: string; device_name: string | null; created_at: string; last_used_at: string | null }
interface DemoProfile { key: string; display_name: string; summary: string; label: string }

export function Account({ onEditOnboarding }: { onEditOnboarding: () => void }) {
  const { me, refreshMe, setAuth } = useSage()
  const [name, setName] = useState(me?.user.full_name ?? '')
  const [phone, setPhone] = useState(me?.user.phone ?? '')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [sessions, setSessions] = useState<DeviceSession[] | null>(null)
  const [demos, setDemos] = useState<DemoProfile[]>([])
  const [demo, setDemo] = useState('')

  const load = useCallback(async () => {
    const [s, d] = await Promise.all([api.get<{ items: DeviceSession[] }>('/v1/auth/sessions'), api.get<{ items: DemoProfile[] }>('/v1/demo-profiles')])
    setSessions(s.items)
    setDemos(d.items)
    setDemo(d.items[0]?.key ?? '')
  }, [])
  useEffect(() => { void load().catch(() => setSessions([])) }, [load])
  useEffect(() => { setName(me?.user.full_name ?? ''); setPhone(me?.user.phone ?? '') }, [me])

  const save = async () => {
    setSaving(true)
    setMsg('')
    try {
      await api.patch('/v1/me', { full_name: name, phone: phone || null })
      await refreshMe()
      setMsg('Saved')
    } catch (e) {
      setMsg(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  const loadDemo = async () => {
    if (!confirm('Replace your profile and signals with this labelled synthetic demo profile?')) return
    await api.post('/v1/profile/load-demo', { key: demo })
    await refreshMe()
    setMsg('Demo profile loaded — go to Home and press "Find my priority".')
  }

  const sub = me?.subscription
  return (
    <Page title="Settings" subtitle={me?.user.email}>
      <Card className="space-y-4 p-5">
        <div className="flex items-center justify-between"><h2 className="font-bold">Profile</h2>
          <Badge tone="primary">{me?.user.mode}</Badge></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Phone (for AI calls)"><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91…" /></Field>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={save} loading={saving}>Save</Button>
          <Button size="sm" variant="outline" onClick={onEditOnboarding}>Edit goals &amp; context</Button>
          {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
        </div>
      </Card>

      <Card className="space-y-4 p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">Plan &amp; usage</h2>
          {sub && <Badge tone="success">{sub.plan_name}{sub.is_test ? ' · beta' : ''}</Badge>}
        </div>
        {!sub ? <Spinner /> : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Usage label="Voice minutes" m={{ allowance: Math.round(sub.voice.allowance_seconds / 60), used: Math.round(sub.voice.used_seconds / 60), remaining: Math.floor(sub.voice.remaining_seconds / 60) }} />
            <Usage label="AI plans & cue-card decks" m={sub.ai_requests} />
            <Usage label="Ask SAGE messages" m={sub.chat_messages} />
            <Usage label="Auto-apply agent steps" m={sub.autoapply_calls} />
          </div>
        )}
        {sub?.period_end && <p className="text-[11px] text-muted-foreground">Renews {new Date(sub.period_end).toLocaleDateString()}</p>}
      </Card>

      <Card className="space-y-3 p-5">
        <h2 className="font-bold">Try a demo scenario</h2>
        <p className="text-xs text-muted-foreground">Load a clearly labelled synthetic profile to explore priorities and check-ins. It replaces your current signals.</p>
        <div className="flex gap-2">
          <Select value={demo} onChange={(e) => setDemo(e.target.value)} options={demos.map((d) => ({ value: d.key, label: d.display_name }))} />
          <Button variant="outline" onClick={loadDemo} disabled={!demo}>Load</Button>
        </div>
      </Card>

      <Card className="space-y-3 p-5">
        <div className="flex items-center justify-between"><h2 className="font-bold">Signed-in devices</h2>
          <Button size="sm" variant="ghost" onClick={() => void load()}><RefreshCw className="h-3.5 w-3.5" /></Button></div>
        {sessions === null ? <Spinner /> : sessions.length === 0 ? <p className="text-xs text-muted-foreground">No other device sessions.</p> : sessions.map((s) => (
          <div key={s.id} className="flex items-center gap-3 rounded-[var(--radius-input)] bg-background/60 p-3 text-sm">
            <LaptopMinimal className="h-4 w-4 text-muted-foreground" />
            <div className="min-w-0 flex-1"><div className="truncate font-semibold">{s.device_name ?? s.client}</div>
              <div className="text-[11px] text-muted-foreground">Signed in {timeAgo(s.created_at)} · last used {timeAgo(s.last_used_at ?? s.created_at)}</div></div>
            <Button size="sm" variant="ghost" onClick={async () => { await api.del(`/v1/auth/sessions/${s.id}`); void load() }}>Revoke</Button>
          </div>
        ))}
        <Button variant="outline" onClick={async () => setAuth(await window.sage.signOut())}><LogOut className="h-4 w-4" /> Sign out of this device</Button>
      </Card>
    </Page>
  )
}

function Usage({ label, m }: { label: string; m: Meter }) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs"><span className="font-semibold">{label}</span><span className="text-muted-foreground">{m.remaining.toLocaleString()} left of {m.allowance.toLocaleString()}</span></div>
      <Progress value={m.allowance ? m.used / m.allowance : 0} />
    </div>
  )
}
