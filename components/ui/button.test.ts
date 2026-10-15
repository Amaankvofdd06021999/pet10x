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
  // The shadcn names were aliases while screens moved; one set of names now.
  it.each(['default', 'destructive', 'outline', 'ghost'])('legacy variant %s is gone', (legacy) => {
    const c = classes({ variant: legacy as never })
    expect(c.filter((x) => /^(hover:)?(bg|text)-/.test(x) && !x.startsWith('text-body'))).toEqual([])
  })
  it('legacy names are type errors too', () => {
    // @ts-expect-error — `outline` is no longer a variant; tsc fails if it comes back.
    buttonVariants({ variant: 'outline' })
    // @ts-expect-error — `default` is no longer a size.
    buttonVariants({ size: 'default' })
  })
  it('legacy size default is gone', () => {
    expect(classes({ size: 'default' as never })).not.toContain('min-h-11')
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
