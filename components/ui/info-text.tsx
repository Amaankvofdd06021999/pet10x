import type { ComponentProps } from 'react'
import { CheckCircle2 } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * ErrorText's counterpart for a confirmation ("New code sent…"): the words
 * stay dark and a small green check in front carries the "done". Announced
 * with role="status", politely.
 */
export function InfoText({ className, children, ...props }: ComponentProps<'p'>) {
  return (
    <p role="status" className={cn('flex items-start gap-1.5 text-meta text-foreground', className)} {...props}>
      <CheckCircle2 className="mt-px size-3.5 shrink-0 text-success" aria-hidden="true" />
      <span>{children}</span>
    </p>
  )
}
