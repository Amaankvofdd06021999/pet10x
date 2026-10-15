import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

/*
 * The one pill (spec §2): a soft background with dark text, and an optional
 * solid dot in the tone's own colour. The text is always `foreground` — the
 * tone is carried by the tint and the dot, never by coloured words.
 *
 * `default`, `secondary`, `destructive` and `outline` are the shadcn names,
 * kept as aliases until the callers that use them move.
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
        // Legacy shadcn names → the spec variants.
        default: 'bg-primary-soft',
        secondary: 'bg-muted',
        destructive: 'bg-destructive-soft',
        outline: 'border-border bg-transparent',
      },
    },
    defaultVariants: {
      variant: 'neutral',
    },
  },
)

const DOT: Record<string, string> = {
  neutral: 'bg-muted-foreground',
  secondary: 'bg-muted-foreground',
  outline: 'bg-muted-foreground',
  brand: 'bg-primary',
  default: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-destructive',
  destructive: 'bg-destructive',
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
