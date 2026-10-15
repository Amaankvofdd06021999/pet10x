import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

/*
 * The one pill (spec §2): a soft background with dark text, and an optional
 * solid dot in the tone's own colour. The text is always `foreground` — the
 * tone is carried by the tint and the dot, never by coloured words.
 */
const badgeVariants = cva(
  'inline-flex items-center justify-center gap-1 rounded-full border border-transparent px-2 py-0.5 text-caption font-semibold text-foreground w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 [&>svg]:pointer-events-none overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2',
  {
    variants: {
      variant: {
        neutral: 'bg-muted',
        brand: 'bg-primary-soft',
        success: 'bg-success-soft',
        warning: 'bg-warning-soft',
        danger: 'bg-destructive-soft',
        info: 'bg-info-soft',
      },
    },
    defaultVariants: {
      variant: 'neutral',
    },
  },
)

/**
 * The data layer speaks in tones (`lib/data/appointment-labels.ts`,
 * `lib/data/owner-bills.ts`): good / warn / bad. This is the one place they
 * become Badge variants.
 */
export type Tone = 'neutral' | 'good' | 'warn' | 'bad' | 'info' | 'accent'

export const TONE_VARIANT = {
  neutral: 'neutral',
  good: 'success',
  warn: 'warning',
  bad: 'danger',
  info: 'info',
  accent: 'brand',
} as const satisfies Record<Tone, string>

const DOT: Record<string, string> = {
  neutral: 'bg-muted-foreground',
  brand: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-destructive',
  info: 'bg-info',
}

function Badge({
  className,
  variant,
  dot = false,
  asChild = false,
  children,
  ...props
}: React.ComponentProps<'span'> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean; dot?: boolean }) {
  const Comp = asChild ? Slot : 'span'

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    >
      {dot && !asChild && (
        <span aria-hidden="true" className={cn('size-1.5 rounded-full', DOT[variant ?? 'neutral'])} />
      )}
      {children}
    </Comp>
  )
}

export { Badge, badgeVariants }
