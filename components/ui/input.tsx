import * as React from 'react'

import { cn } from '@/lib/utils'

/*
 * One field look for every text control — Input, Textarea and NativeSelect
 * share it, so a form never mixes two border radii or two focus treatments.
 * The ring is the brand orange: a field is white, so orange shows on it
 * (unlike on a primary button, which gets a dark ring instead).
 */
export const FIELD_CLASS =
  'w-full min-w-0 rounded-md border border-input bg-card px-3 py-2 text-base text-foreground outline-none transition-[color,box-shadow] md:text-body placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-destructive'

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        FIELD_CLASS,
        'h-10 file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-meta file:font-medium file:text-foreground',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
