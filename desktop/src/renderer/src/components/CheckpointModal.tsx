import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useEffect, useState } from 'react'
import type { Checkpoint, CheckpointResolution, CheckpointType } from '@shared/types'
import { useAuta } from '@/state'
import { Button } from './ui'
import { ShieldAlert, KeyRound, UserPlus, MailCheck, Send, Copy, ArrowRight, RefreshCw, Eye } from 'lucide-react'

const META: Record<CheckpointType, { icon: React.ReactNode; title: string; tone: string }> = {
  captcha: { icon: <ShieldAlert className="h-5 w-5" />, title: 'Verification needs you', tone: 'text-warning' },
  account_creation: { icon: <UserPlus className="h-5 w-5" />, title: 'Create the account', tone: 'text-primary' },
  password_or_sso: { icon: <KeyRound className="h-5 w-5" />, title: 'Sign in required', tone: 'text-primary' },
  email_otp: { icon: <MailCheck className="h-5 w-5" />, title: 'Email verification', tone: 'text-primary' },
  final_submit: { icon: <Send className="h-5 w-5" />, title: 'Ready to submit', tone: 'text-success' }
}

export function CheckpointModal() {
  const { checkpoints, dismissCheckpoint, gmail } = useAuta()
  const cp = checkpoints[0]
  const [otp, setOtp] = useState<Checkpoint['otp']>()
  const [checkingMail, setCheckingMail] = useState(false)
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    setOtp(cp?.otp)
  }, [cp?.id])

  const resolve = async (res: CheckpointResolution) => {
    if (!cp) return
    await window.auta.resolveCheckpoint(cp.id, res)
    dismissCheckpoint(cp.id)
  }

  return (
    <AnimatePresence>
      {cp && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6 backdrop-blur-[2px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="checkpoint-title"
            aria-describedby="checkpoint-message"
            className="w-[560px] max-w-full overflow-hidden rounded-[var(--radius-card)] bg-card text-card-foreground shadow-[var(--shadow-float)] ring-1 ring-border"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
            transition={{ duration: reduceMotion ? 0.12 : 0.22, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="relative overflow-hidden px-6 pb-5 pt-6">
              <div className="surface-grid pointer-events-none absolute inset-0" aria-hidden="true" />
              <div className={`relative mb-3 flex items-center gap-2 ${META[cp.type].tone}`}>
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-current/10">{META[cp.type].icon}</span>
                <div>
                  <div className="mono text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Agent paused safely</div>
                  <h3 id="checkpoint-title" className="mt-0.5 text-xl font-bold text-foreground">{META[cp.type].title}</h3>
                </div>
              </div>
              <p id="checkpoint-message" className="relative rounded-xl bg-background/80 p-4 text-[0.95rem] font-medium leading-relaxed text-foreground ring-1 ring-border">{cp.message}</p>
            </div>
            <div className="p-6 pt-5">

            {(cp.type === 'password_or_sso' || cp.type === 'account_creation') && (
              <div className="mb-5 rounded-xl bg-primary/8 p-4 ring-1 ring-primary/20">
                <p className="text-sm font-bold text-foreground">SAGE is watching the open browser</p>
                <ol className="mt-3 space-y-2 text-sm leading-relaxed text-foreground/90">
                  <li className="flex gap-3"><span className="mono flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">1</span><span>{cp.type === 'account_creation' ? 'Review any terms or verification step that prevented automatic account creation.' : 'Complete only the credential or consent step still visible in the browser.'}</span></li>
                  <li className="flex gap-3"><span className="mono flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">2</span><span>{gmail.connected ? 'If the site sends a code, return here after requesting it; Gmail is connected and SAGE will surface the newest code.' : 'Complete any email verification in your inbox. Connect Gmail in Settings if you want SAGE to surface verification codes.'}</span></li>
                  <li className="flex gap-3"><span className="mono flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">3</span><span>Once sign-in succeeds, this dialog closes and the application continues automatically. The resume button remains as a fallback.</span></li>
                </ol>
              </div>
            )}

            {cp.type === 'captcha' && (
              <div className="mb-5 rounded-xl bg-warning/10 p-4">
                <div className="flex gap-3"><Eye className="mt-0.5 h-4 w-4 shrink-0 text-warning" /><div><p className="text-sm font-semibold text-foreground">Complete the visible challenge</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">The application browser is waiting exactly where the challenge appeared. Solve it there, then return here and resume the agent.</p></div></div>
              </div>
            )}

            {cp.type === 'email_otp' && otp && (
              <div className="mb-4 rounded-xl bg-background p-4 text-sm shadow-[inset_0_0_0_1px_oklch(var(--border))]">
                {otp.subject && <div className="mb-2 text-xs text-muted-foreground">{otp.subject}</div>}
                {otp.code && (
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xl tracking-widest text-primary">{otp.code}</span>
                    <Button size="sm" variant="subtle" onClick={() => navigator.clipboard.writeText(otp.code!)}>
                      <Copy className="h-3.5 w-3.5" /> Copy
                    </Button>
                  </div>
                )}
                {otp.link && (
                  <a href={otp.link} target="_blank" rel="noreferrer" className="mt-2 block truncate rounded-md py-1 text-xs font-semibold text-primary underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    {otp.link}
                  </a>
                )}
              </div>
            )}
            {cp.type === 'email_otp' && !otp && (
              <div className="mb-4 flex items-center justify-between gap-4 rounded-xl bg-background p-3 text-xs text-muted-foreground">
                <span>No matching message found yet.</span>
                <Button size="sm" variant="outline" loading={checkingMail} onClick={async () => { setCheckingMail(true); try { setOtp((await window.auta.gmailFindLatestOtp()) ?? undefined) } finally { setCheckingMail(false) } }}><RefreshCw className="h-3.5 w-3.5" /> Check Gmail</Button>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              {cp.type === 'final_submit' ? (
                <Button variant="success" className="flex-1" onClick={() => resolve({ action: 'submit' })}>
                  <Send className="h-4 w-4" /> Review complete · submit
                </Button>
              ) : (
                <Button className="flex-1" onClick={() => resolve({ action: 'resume' })}>
                  {cp.type === 'password_or_sso'
                    ? 'I’m signed in · resume'
                    : cp.type === 'account_creation'
                      ? 'Account ready · resume'
                      : 'Resume agent'} <ArrowRight className="h-4 w-4" />
                </Button>
              )}
              <Button variant="outline" onClick={() => resolve({ action: 'skip' })}>
                Skip job
              </Button>
            </div>
            <p className="mt-4 text-center text-[11px] leading-relaxed text-muted-foreground">Saved passwords are encrypted locally and used only by the deterministic sign-in broker. They are never sent to the AI model.</p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
