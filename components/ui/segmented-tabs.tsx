'use client'

import type { KeyboardEvent } from 'react'

import { cn } from '@/lib/utils'

/**
 * Tabs that behave like tabs: roles, aria-selected and arrow keys. The active
 * tab is dark text over an orange indicator — the orange marks where you are
 * without ever being the colour of the words.
 */
export function SegmentedTabs<T extends string>({
  tabs,
  active,
  onChange,
  label,
}: {
  tabs: Array<{ id: T; label: string; count?: number }>
  active: T
  onChange: (id: T) => void
  label: string
}) {
  const onKeyDown = (e: KeyboardEvent) => {
    const i = tabs.findIndex((t) => t.id === active)
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      onChange(tabs[(i + 1) % tabs.length].id)
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      onChange(tabs[(i - 1 + tabs.length) % tabs.length].id)
    }
  }
  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className="flex flex-wrap gap-1 border-b border-border"
    >
      {tabs.map((t) => {
        const on = t.id === active
        return (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(t.id)}
            className={cn(
              '-mb-px min-h-11 border-b-2 px-3 text-meta font-semibold transition-colors outline-none focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring',
              on
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
            {typeof t.count === 'number' && (
              <span className="ml-1 text-muted-foreground tabular-nums">({t.count})</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
