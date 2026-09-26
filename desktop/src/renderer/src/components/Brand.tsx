import sageIcon from '@/assets/sage-icon.png'
import { cn } from '@/lib/utils'

export function BrandMark({ size = 'md' }: { size?: 'md' | 'lg' }) {
  return (
    <img
      src={sageIcon}
      alt=""
      aria-hidden="true"
      className={cn('relative shrink-0 rounded-[0.8rem] object-cover shadow-[0_10px_30px_oklch(var(--primary)/0.24)]', size === 'lg' ? 'h-12 w-12' : 'h-9 w-9')}
    />
  )
}

export function Brand() {
  return (
    <div className="flex items-center gap-3">
      <BrandMark />
      <div className="leading-none">
        <div className="font-display text-base font-bold tracking-[-0.04em]">SAGE AI</div>
        <div className="mt-1 text-[10px] font-semibold text-muted-foreground">Action &amp; growth engine</div>
      </div>
    </div>
  )
}
