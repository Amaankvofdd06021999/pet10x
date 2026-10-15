import { describe, expect, it } from 'vitest'
import { cn } from '@/lib/utils'
import { buttonVariants } from './button'

// Through cn, as Button and every buttonVariants caller apply it, so a
// compound class overrides the size's class the way it does on screen.
const classes = (opts: Parameters<typeof buttonVariants>[0]) => cn(buttonVariants(opts)).split(/\s+/)

describe('buttonVariants', () => {
  it('defaults to primary at md', () => {
    expect(buttonVariants()).toBe(buttonVariants({ variant: 'primary', size: 'md' }))
    expect(classes({})).toEqual(expect.arrayContaining(['bg-primary', 'hover:bg-primary-hover', 'min-h-11']))
  })
  it.each([
    ['default', 'primary'],
    ['destructive', 'danger'],
    ['outline', 'secondary'],
    ['ghost', 'quiet'],
  ] as const)('legacy %s resolves to %s', (legacy, next) => {
    expect(buttonVariants({ variant: legacy })).toBe(buttonVariants({ variant: next }))
  })
  it('legacy size default resolves to md', () => {
    expect(buttonVariants({ size: 'default' })).toBe(buttonVariants({ size: 'md' }))
  })
  it('primary focus ring is dark and offset, never the orange ring', () => {
    const c = classes({ variant: 'primary' })
    expect(c).toEqual(expect.arrayContaining(['focus-visible:ring-foreground', 'focus-visible:ring-offset-2']))
    expect(c).not.toContain('focus-visible:ring-ring')
  })
  it.each(['sm', 'md', 'lg'] as const)('link has no min height at %s', (size) => {
    const c = classes({ variant: 'link', size })
    expect(c.filter((x) => x.startsWith('min-h-') && x !== 'min-h-0')).toEqual([])
    expect(c).toContain('min-h-0')
  })
})
