import { describe, expect, it } from 'vitest'
import { loadingProps } from './loading-props'

describe('loadingProps', () => {
  it('disables and marks busy while loading', () => {
    expect(loadingProps(true, undefined)).toEqual({ disabled: true, 'aria-busy': true })
    expect(loadingProps(true, false)).toEqual({ disabled: true, 'aria-busy': true })
  })
  it('leaves aria-busy off and passes disabled through when idle', () => {
    expect(loadingProps(false, undefined)).toEqual({ disabled: undefined, 'aria-busy': undefined })
    expect(loadingProps(false, true)).toEqual({ disabled: true, 'aria-busy': undefined })
  })
})
