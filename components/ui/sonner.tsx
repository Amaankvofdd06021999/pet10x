'use client'

import { useTheme } from 'next-themes'
import { Toaster as Sonner, ToasterProps } from 'sonner'

/*
 * Toasts are announced from inside an open dialog without any portal trick.
 * Radix Dialog/Menu/Popover/Select hide the rest of the page with aria-hidden's
 * `hideOthers` (never `inertOthers`/`suppressOthers`, which would not spare
 * live regions). `hideOthers` adds every `[aria-live]` element to the nodes it
 * keeps visible, and Sonner renders its toaster inside an always-present
 * `<section aria-live="polite">`, mounted with the page before any dialog opens.
 * Taps on a toast are handled separately by lib/inside-toast.ts.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = 'system' } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps['theme']}
      className="toaster group"
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
