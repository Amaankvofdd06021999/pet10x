import { Loader2 } from 'lucide-react'

import { cn } from '@/lib/utils'

/** The spinning glyph on its own — inside a Button's `loading`, or inline. */
function SpinnerIcon({ className, ...props }: React.ComponentProps<'svg'>) {
  return <Loader2 aria-hidden="true" className={cn('size-4 animate-spin', className)} {...props} />
}

/** A whole region that is loading: the glyph and a word, announced politely. */
function Spinner({ label = 'Loading', className }: { label?: string; className?: string }) {
  return (
    <div
      className={cn('flex items-center justify-center gap-2 py-10 text-muted-foreground', className)}
      role="status"
    >
      <SpinnerIcon />
      <span className="text-meta">{label}…</span>
    </div>
  )
}

export { Spinner, SpinnerIcon }
