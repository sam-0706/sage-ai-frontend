import { cn } from '@/lib/utils'
import { forwardRef } from 'react'
import { Check, X } from 'lucide-react'

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'outline' | 'ghost' | 'success' | 'destructive' | 'subtle'
  size?: 'sm' | 'md' | 'lg' | 'icon'
  loading?: boolean
}

export function Button({ className, variant = 'default', size = 'md', loading = false, children, ...props }: ButtonProps) {
  const variants: Record<NonNullable<ButtonProps['variant']>, string> = {
    default: 'bg-primary text-primary-foreground shadow-[0_10px_28px_oklch(var(--primary)/0.18)] hover:brightness-105',
    outline: 'bg-card text-foreground shadow-[inset_0_0_0_1px_oklch(var(--border))] hover:bg-secondary',
    ghost: 'text-muted-foreground hover:bg-secondary hover:text-foreground',
    subtle: 'bg-secondary text-secondary-foreground hover:brightness-105',
    success: 'bg-success text-white hover:brightness-105',
    destructive: 'bg-destructive text-destructive-foreground hover:brightness-105'
  }
  const sizes: Record<NonNullable<ButtonProps['size']>, string> = {
    sm: 'h-8 px-3 text-xs',
    md: 'h-10 px-4 text-sm',
    lg: 'h-12 px-6 text-base',
    icon: 'h-9 w-9'
  }
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-input)] font-semibold transition-[transform,opacity,background-color,color,box-shadow] duration-[var(--dur-short)] ease-[var(--ease-out)] no-drag',
        'active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        variants[variant],
        sizes[size],
        className
      )}
      aria-busy={loading || undefined}
      disabled={loading || props.disabled}
      data-state={loading ? 'loading' : undefined}
      {...props}
    >
      {loading ? <Spinner className="h-4 w-4" /> : children}
    </button>
  )
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-[var(--radius-card)] bg-card text-card-foreground shadow-[var(--shadow-card)]', className)} {...props} />
}

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-10 w-full rounded-[var(--radius-input)] bg-background px-3 text-sm shadow-[inset_0_0_0_1px_oklch(var(--input))] transition-[box-shadow,background-color] duration-[var(--dur-short)] no-drag',
        'placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-destructive',
        className
      )}
      {...props}
    />
  )
)
Input.displayName = 'Input'

export type SelectOption = string | { value: string; label: string }

export function Select({
  className,
  options,
  value,
  ...props
}: Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'value'> & {
  options: SelectOption[]
  value: string
}) {
  const normalized = options.map((option) => typeof option === 'string' ? { value: option, label: option } : option)
  const currentIsKnown = !value || normalized.some((option) => option.value === value)
  const visibleOptions = currentIsKnown
    ? normalized
    : [{ value, label: `${value} (saved value)` }, ...normalized]

  return (
    <select
      value={value}
      className={cn(
        'h-10 w-full rounded-[var(--radius-input)] bg-background px-3 text-sm shadow-[inset_0_0_0_1px_oklch(var(--input))] transition-[box-shadow,background-color] duration-[var(--dur-short)] no-drag',
        'disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-destructive',
        className
      )}
      {...props}
    >
      {visibleOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  )
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'w-full rounded-[var(--radius-input)] bg-background px-3 py-2 text-sm shadow-[inset_0_0_0_1px_oklch(var(--input))] no-drag',
        'placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-destructive',
        className
      )}
      {...props}
    />
  )
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      {children}
      {hint && <span className="text-[11px] leading-relaxed text-muted-foreground/80">{hint}</span>}
    </label>
  )
}

export function Badge({ children, tone = 'default', className }: {
  children: React.ReactNode
  tone?: 'default' | 'success' | 'warning' | 'destructive' | 'primary' | 'muted'
  className?: string
}) {
  const tones: Record<string, string> = {
    default: 'bg-secondary text-secondary-foreground',
    primary: 'bg-primary/15 text-primary',
    success: 'bg-success/15 text-success',
    warning: 'bg-warning/15 text-warning',
    destructive: 'bg-destructive/15 text-destructive',
    muted: 'bg-muted text-muted-foreground'
  }
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold', tones[tone], className)}>{children}</span>
}

export function Progress({ value }: { value: number }) {
  const normalized = Math.min(1, Math.max(0, value))
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary" role="progressbar" aria-valuenow={Math.round(normalized * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full origin-left rounded-full bg-primary transition-transform duration-[var(--dur-long)] ease-[var(--ease-out)]" style={{ transform: `scaleX(${normalized})` }} />
    </div>
  )
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-6 w-11 rounded-full transition-colors duration-[var(--dur-short)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background no-drag',
        checked ? 'bg-primary' : 'bg-secondary'
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'absolute left-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-white shadow-sm transition-transform duration-[var(--dur-short)] ease-[var(--ease-out)]',
          checked ? 'translate-x-5 text-primary' : 'translate-x-0 text-muted-foreground'
        )}
      >
        {checked ? <Check className="h-3 w-3" strokeWidth={3} /> : <X className="h-3 w-3" strokeWidth={2.5} />}
      </span>
    </button>
  )
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cn('inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent', className)} aria-hidden="true" />
}
