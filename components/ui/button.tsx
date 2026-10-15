import * as React from 'react'
import { Slot, Slottable } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { ChevronRight, Loader2 } from 'lucide-react'

import { cn } from '@/lib/utils'
import { loadingProps } from '@/lib/loading-props'

/*
 * The one button (spec §2). Five looks, three sizes.
 *
 * Focus: the ring is the dark foreground, offset from the button. The brand
 * ring colour is the button's own fill, so an orange ring on an orange button
 * would be invisible — keyboard users would lose their place on exactly the
 * buttons that matter most.
 *
 * The shadcn names (`default`, `destructive`, `outline`, `ghost`) are kept as
 * aliases of the new ones so the callers that still use them keep working
 * until their batch moves them; `secondary` and `link` are the same names in
 * both sets.
 */
const PRIMARY =
  'bg-primary text-primary-foreground font-semibold hover:bg-primary-hover'
const SECONDARY =
  'border border-border bg-card text-foreground font-semibold hover:bg-muted'
const QUIET = 'text-foreground font-semibold hover:bg-muted'
// A filter rather than an opacity tint (`/90`), which would let the card
// show through and is the kind of modifier the Task 7 lint rule bans.
const DANGER =
  'bg-destructive text-destructive-foreground font-semibold hover:brightness-95'
const LINK = 'text-foreground font-semibold hover:underline underline-offset-4'

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        primary: PRIMARY,
        secondary: SECONDARY,
        quiet: QUIET,
        danger: DANGER,
        link: LINK,
        // Legacy shadcn names → the spec variants.
        default: PRIMARY,
        destructive: DANGER,
        outline: SECONDARY,
        ghost: QUIET,
      },
      size: {
        sm: 'h-9 gap-1.5 px-3 text-meta has-[>svg]:px-2.5',
        md: 'min-h-11 px-4 text-body has-[>svg]:px-3.5',
        lg: 'min-h-12 px-6 text-body has-[>svg]:px-5',
        // Legacy shadcn sizes, used by the primitives (calendar, carousel,
        // sidebar, input-group, pagination). `default` is `md`.
        default: 'min-h-11 px-4 text-body has-[>svg]:px-3.5',
        icon: 'size-9',
        'icon-sm': 'size-8',
        'icon-lg': 'size-10',
      },
    },
    // A link sits flush with the text around it at any size.
    compoundVariants: [{ variant: 'link', class: 'h-auto min-h-0 px-0 has-[>svg]:px-0' }],
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
)

type ButtonProps = React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    /** Shows the spinner, sets aria-busy and disables the button. */
    loading?: boolean
  }

function Button({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : 'button'
  const isLink = variant === 'link'

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...loadingProps(loading, disabled)}
      {...props}
    >
      {loading && <Loader2 className="animate-spin" aria-hidden="true" />}
      {/* Slottable so asChild still hands the child element the classes. */}
      <Slottable>{children}</Slottable>
      {/* A link is marked by weight and a chevron, never by orange text. */}
      {isLink && !asChild && <ChevronRight aria-hidden="true" />}
    </Comp>
  )
}

export { Button, buttonVariants }
export type { ButtonProps }
