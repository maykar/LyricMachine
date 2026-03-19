import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests for adjustDropdown utility.
 *
 * We mock DOM elements with getBoundingClientRect and getComputedStyle
 * to test the repositioning logic without a real browser.
 */

const { adjustDropdown } = await import('../../src/utils/adjustDropdown.js')

// Create a mock element with controllable rect and position
function mockElement({ top = 0, left = 0, width = 100, height = 50, position = 'absolute' } = {}) {
  const style = {
    position,
    removeProperty: vi.fn(),
  }
  const el = {
    style,
    getBoundingClientRect: vi.fn(() => ({
      top,
      left,
      right: left + width,
      bottom: top + height,
      width,
      height,
    })),
  }
  // Mock getComputedStyle
  vi.spyOn(window, 'getComputedStyle').mockReturnValue({ position })
  return el
}

describe('adjustDropdown', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    // Set viewport size
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true })
    Object.defineProperty(window, 'innerHeight', { value: 768, writable: true })
  })

  it('does nothing for null input', async () => {
    await adjustDropdown(null)
    // Should not throw
  })

  it('does nothing for ref with null value', async () => {
    await adjustDropdown({ value: null })
    // Should not throw
  })

  it('resets previous adjustments before measuring', async () => {
    const el = mockElement({ top: 100, left: 100 })
    await adjustDropdown(el)

    expect(el.style.removeProperty).toHaveBeenCalledWith('top')
    expect(el.style.removeProperty).toHaveBeenCalledWith('bottom')
    expect(el.style.removeProperty).toHaveBeenCalledWith('left')
    expect(el.style.removeProperty).toHaveBeenCalledWith('right')
  })

  it('flips vertically when bottom overflows viewport (absolute)', async () => {
    const el = mockElement({ top: 750, left: 100, height: 50, position: 'absolute' })
    await adjustDropdown(el)

    expect(el.style.top).toBe('auto')
    expect(el.style.bottom).toBe('calc(100% + 0.375rem)')
  })

  it('shifts vertically when bottom overflows viewport (fixed)', async () => {
    const el = mockElement({ top: 750, left: 100, height: 50, position: 'fixed' })
    await adjustDropdown(el)

    expect(el.style.top).toBe(`${768 - 50}px`)
  })

  it('flips back down when top is negative (absolute)', async () => {
    const el = mockElement({ top: -20, left: 100, height: 50, position: 'absolute' })
    await adjustDropdown(el)

    expect(el.style.bottom).toBe('auto')
    expect(el.style.top).toBe('calc(100% + 0.375rem)')
  })

  it('clamps to top=0 when top is negative (fixed)', async () => {
    const el = mockElement({ top: -20, left: 100, height: 50, position: 'fixed' })
    await adjustDropdown(el)

    expect(el.style.top).toBe('0px')
  })

  it('shifts left when right edge overflows (absolute)', async () => {
    const el = mockElement({ top: 100, left: 950, width: 100, position: 'absolute' })
    await adjustDropdown(el)

    expect(el.style.left).toBe('auto')
    expect(el.style.right).toBe('0')
  })

  it('shifts left when right edge overflows (fixed)', async () => {
    const el = mockElement({ top: 100, left: 950, width: 100, position: 'fixed' })
    await adjustDropdown(el)

    expect(el.style.left).toBe(`${1024 - 100}px`)
  })

  it('shifts right when left edge is negative (absolute)', async () => {
    const el = mockElement({ top: 100, left: -30, width: 100, position: 'absolute' })
    await adjustDropdown(el)

    expect(el.style.right).toBe('auto')
    expect(el.style.left).toBe('0')
  })

  it('does nothing when element fits in viewport', async () => {
    const el = mockElement({ top: 200, left: 200, width: 100, height: 50, position: 'absolute' })
    await adjustDropdown(el)

    // Should not set any position overrides (removeProperty was called for reset, but no new values)
    expect(el.style.top).toBeUndefined()
    expect(el.style.bottom).toBeUndefined()
  })

  it('handles Vue ref wrapper', async () => {
    const el = mockElement({ top: 100, left: 100 })
    await adjustDropdown({ value: el })
    // Should work without error — measures el.value
    expect(el.getBoundingClientRect).toHaveBeenCalled()
  })
})
