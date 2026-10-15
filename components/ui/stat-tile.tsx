import { cn } from '@/lib/utils'

export type StatTone = 'default' | 'good' | 'warn' | 'bad' | 'info' | 'accent'

// The number stays dark; the tone is a small solid dot beside the label.
// Coloured numerals were the old way, and orange or amber digits on white are
// exactly the unreadable text the palette rules out.
const TONE_DOT: Record<StatTone, string | null> = {
  default: null,
  good: 'bg-success',
  warn: 'bg-warning',
  bad: 'bg-destructive',
  info: 'bg-info',
  accent: 'bg-primary',
}

export function StatTile({
  label,
  value,
  hint,
  tone = 'default',
  onClick,
}: {
  label: string
  value: string | number
  hint?: string
  tone?: StatTone
  onClick?: () => void
}) {
  const Tag = onClick ? 'button' : 'div'
  const dot = TONE_DOT[tone]
  return (
    <Tag
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      className={cn(
        'rounded-lg border border-border bg-card p-4 text-left',
        onClick &&
          'transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      )}
    >
      <p className="flex items-center gap-1.5 text-caption font-semibold uppercase tracking-wide text-muted-foreground">
        {dot && <span aria-hidden="true" className={cn('size-2 rounded-full', dot)} />}
        {label}
      </p>
      <p className="mt-1 text-heading font-semibold leading-none tabular-nums text-foreground">{value}</p>
      {hint && <p className="mt-1 text-caption text-muted-foreground">{hint}</p>}
    </Tag>
  )
}
