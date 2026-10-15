import { AlertTriangle } from 'lucide-react'

import { Button } from '@/components/ui/button'

/** A failed read, said plainly, with a retry when the caller can offer one. */
export function LoadError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-md border border-border bg-destructive-soft p-4">
      <p className="flex items-center gap-2 text-meta font-semibold text-foreground">
        <AlertTriangle className="size-4 text-destructive" aria-hidden="true" />
        Could not load this
      </p>
      <p className="text-meta text-foreground">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}
