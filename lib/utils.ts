import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// The type scale in app/globals.css (`--text-caption` … `--text-heading`)
// adds font sizes tailwind-merge has never heard of. Left alone it files any
// unknown `text-*` under colour, so `cn('text-body text-foreground')` would
// drop the size. Registering the names puts them with the other sizes.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ['caption', 'meta', 'body', 'title', 'heading'],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
