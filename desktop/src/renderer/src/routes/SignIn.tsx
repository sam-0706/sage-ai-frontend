import { useState } from 'react'
import { ExternalLink, KeyRound, ShieldCheck, WifiOff } from 'lucide-react'
import { useSage } from '@/sage/state'
import { Button, Card, Spinner } from '@/components/ui'
import { BrandMark } from '@/components/Brand'

export function SignIn({ onDemo }: { onDemo: () => void }) {
  const { auth, setAuth } = useSage()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const start = async () => {
    setBusy(true)
    setError('')
    try {
      setAuth(await window.sage.signIn())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  const cancel = async () => setAuth(await window.sage.cancelSignIn())
  const retry = async () => setAuth(await window.sage.authStatus())

  const waiting = auth?.status === 'waiting' ? auth : null
  const reason = auth?.status === 'signed_out' ? auth.reason : undefined

  return (
    <div className="relative flex h-full items-center justify-center px-6">
      <div className="drag absolute inset-x-0 top-0 h-9" />
      <div className="surface-grid pointer-events-none absolute inset-0 opacity-60" aria-hidden="true" />
      <Card className="relative w-full max-w-md p-8">
        <div className="flex items-center gap-3">
          <BrandMark size="lg" />
          <div>
            <h1 className="text-2xl font-bold">SAGE AI</h1>
            <p className="text-sm text-muted-foreground">Strategic Action and Growth Engine</p>
          </div>
        </div>

        <Button className="mt-6 w-full" variant="outline" onClick={onDemo}>Explore BITSoM 2026 demo</Button>
        {auth?.status === 'offline' ? (
          <div className="mt-8 space-y-4">
            <div className="flex items-start gap-3 rounded-[var(--radius-input)] bg-warning/10 p-4 text-sm text-warning">
              <WifiOff className="mt-0.5 h-4 w-4 shrink-0" />
              <span>SAGE can't reach its servers right now. Check your internet connection.</span>
            </div>
            <Button className="w-full" onClick={retry}>Try again</Button>
          </div>
        ) : waiting ? (
          <div className="mt-8 space-y-5">
            <p className="text-sm text-muted-foreground">
              Finish Google sign-in in your browser. SAGE will continue automatically.
            </p>
            <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <Spinner className="h-4 w-4 text-primary" /> Waiting for Google sign-in…
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => void window.sage.openExternal(waiting.verificationUrl)}>
                <ExternalLink className="h-4 w-4" /> Reopen browser
              </Button>
              <Button variant="ghost" onClick={cancel}>Cancel</Button>
            </div>
          </div>
        ) : (
          <div className="mt-8 space-y-5">
            <p className="text-sm leading-relaxed text-muted-foreground">
              Sign in with Google to continue. New here? We’ll help you set up your goals. Returning students go straight to their dashboard.
            </p>
            {(reason || error) && (
              <p className="rounded-[var(--radius-input)] bg-destructive/10 p-3 text-sm text-destructive" role="alert">{error || reason}</p>
            )}
            <Button size="lg" className="w-full" loading={busy} onClick={start}>
              <KeyRound className="h-4 w-4" /> Sign in with Google
            </Button>
            <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-success" /> Your session is stored in the OS keychain on this device.
            </p>
          </div>
        )}
      </Card>
    </div>
  )
}
