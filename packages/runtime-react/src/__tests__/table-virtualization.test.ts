import { describe, expect, it } from 'vitest'
import {
  DYNAMIC_TABLE_VIRTUALIZE_THRESHOLD,
  resolveVirtualizeThreshold,
} from '../table-virtualization'

describe('resolveVirtualizeThreshold', () => {
  it('defaults to the shared threshold', () => {
    expect(resolveVirtualizeThreshold()).toBe(DYNAMIC_TABLE_VIRTUALIZE_THRESHOLD)
    expect(resolveVirtualizeThreshold(true)).toBe(DYNAMIC_TABLE_VIRTUALIZE_THRESHOLD)
  })

  it('can be disabled', () => {
    expect(resolveVirtualizeThreshold(false)).toBe(false)
  })

  it('accepts a custom positive threshold', () => {
    expect(resolveVirtualizeThreshold(80)).toBe(80)
  })

  it('treats non-positive numbers as disabled', () => {
    expect(resolveVirtualizeThreshold(0)).toBe(false)
    expect(resolveVirtualizeThreshold(-1)).toBe(false)
  })
})
