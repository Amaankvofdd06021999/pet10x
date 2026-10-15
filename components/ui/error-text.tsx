import type { ComponentProps } from 'react'
import { AlertCircle } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * An error message in the palette's terms: the words stay dark (text is never
 * a status colour) and a small red icon in front carries the "this is wrong".
 * Announced with role="alert"; pass `id` so a field can point
 * aria-describedby at it.
 */
export function ErrorText({ className, children, ...props }: ComponentProps<'p'>) {
  return (
    <p role="alert" className={cn('flex items-start gap-1.5 text-foreground', className)} {...props}>
      <AlertCircle className="mt-px size-3.5 shrink-0 text-destructive" aria-hidden="true" />
      <span>{children}</span>
    </p>
  )
}
