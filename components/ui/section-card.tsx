import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

/**
 * A titled panel. Same radius, border and surface as Card and StatTile, so
 * the three never disagree on what a card looks like.
 */
export function SectionCard({
  title,
  subtitle,
  actions,
  children,
  className = '',
}: {
  title?: string
  subtitle?: string
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('rounded-lg border border-border bg-card', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            {title && <h2 className="text-body font-semibold text-foreground">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-meta text-muted-foreground">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  )
}
