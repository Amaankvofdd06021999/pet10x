import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { contrastRatio } from './contrast'

const css = readFileSync(join(__dirname, '..', 'app', 'globals.css'), 'utf8')

// Pull a token's hex out of one theme block (":root" or ".dark") so the test
// reads what ships, not a copy that can drift.
function token(theme: ':root' | '.dark', name: string): string {
  const start = css.indexOf(`\n${theme} {`)
  const end = css.indexOf('\n}', start)
  const block = css.slice(start, end)
  const m = block.match(new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})\\b`))
  if (!m) throw new Error(`--${name} not defined as hex in ${theme}`)
  return m[1]
}

describe('contrastRatio', () => {
  it('is 21 for white on black and 1 for identical colours', () => {
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 5)
    expect(contrastRatio('#FD9340', '#fd9340')).toBeCloseTo(1, 5)
  })
  it('accepts 3-digit hex and is symmetric', () => {
    expect(contrastRatio('#fff', '#000')).toBeCloseTo(21, 5)
    expect(contrastRatio('#000', '#fff')).toBeCloseTo(21, 5)
  })
  it('rejects malformed hex', () => {
    expect(() => contrastRatio('orange', '#000000')).toThrow()
  })
})

describe.each([':root', '.dark'] as const)('AA contrast tokens (%s)', (theme) => {
  const t = (n: string) => token(theme, n)
  it('primary-strong fill carries primary-foreground text', () => {
    expect(contrastRatio(t('primary-strong'), t('primary-foreground'))).toBeGreaterThanOrEqual(4.5)
  })
  it('primary-text reads on the page ground and on cards', () => {
    expect(contrastRatio(t('primary-text'), t('background'))).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(t('primary-text'), t('card'))).toBeGreaterThanOrEqual(4.5)
  })
  it('success-strong reads on the page ground and on cards', () => {
    expect(contrastRatio(t('success-strong'), t('background'))).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(t('success-strong'), t('card'))).toBeGreaterThanOrEqual(4.5)
  })
  it('muted-foreground placeholder reads on the page ground and on cards', () => {
    expect(contrastRatio(t('muted-foreground'), t('background'))).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(t('muted-foreground'), t('card'))).toBeGreaterThanOrEqual(4.5)
  })
})
