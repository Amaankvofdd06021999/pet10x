import { describe, expect, it } from 'vitest'
import { cn } from './utils'

// The type scale (text-caption … text-heading) are custom font sizes. Stock
// tailwind-merge reads any unknown `text-*` as a colour, so without telling it
// otherwise `cn('text-body text-foreground')` silently drops the size.
describe('cn with the type scale', () => {
  it('keeps a type-scale size beside a text colour', () => {
    expect(cn('text-body text-foreground')).toBe('text-body text-foreground')
    expect(cn('text-muted-foreground', 'text-caption')).toBe('text-muted-foreground text-caption')
  })
  it('lets a later type-scale size win over an earlier one', () => {
    expect(cn('text-body', 'text-title')).toBe('text-title')
    expect(cn('text-sm', 'text-meta')).toBe('text-meta')
  })
  it('still lets a later colour win over an earlier one', () => {
    expect(cn('text-foreground', 'text-muted-foreground')).toBe('text-muted-foreground')
  })
})
