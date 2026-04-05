import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useToast } from '../../src/composables/useToast.js'

describe('useToast', () => {
  let toasts, showToast, dismissToast

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
    const result = useToast()
    toasts = result.toasts
    showToast = result.showToast
    dismissToast = result.dismissToast
    // Clear any leftover toasts from other tests
    toasts.value.splice(0)
  })

  it('returns singleton refs', () => {
    const a = useToast()
    const b = useToast()
    // Both wrappers should point to the same underlying array
    a.showToast('test')
    expect(b.toasts.value).toHaveLength(1)
  })

  it('adds a toast with default type and auto-dismiss', () => {
    showToast('Something failed')
    expect(toasts.value).toHaveLength(1)
    expect(toasts.value[0].message).toBe('Something failed')
    expect(toasts.value[0].type).toBe('error')
  })

  it('supports custom type', () => {
    showToast('Success!', { type: 'success' })
    expect(toasts.value[0].type).toBe('success')
  })

  it('auto-dismisses after duration', () => {
    showToast('Temp', { duration: 2000 })
    expect(toasts.value).toHaveLength(1)

    vi.advanceTimersByTime(2000)
    expect(toasts.value).toHaveLength(0)
  })

  it('manually dismisses by id', () => {
    showToast('A')
    showToast('B')
    expect(toasts.value).toHaveLength(2)

    const idToRemove = toasts.value[0].id
    dismissToast(idToRemove)
    expect(toasts.value).toHaveLength(1)
    expect(toasts.value[0].message).toBe('B')
  })

  it('dismissToast with unknown id is a no-op', () => {
    showToast('A')
    dismissToast(99999)
    expect(toasts.value).toHaveLength(1)
  })

  it('assigns unique ids', () => {
    showToast('A')
    showToast('B')
    showToast('C')
    const ids = toasts.value.map(t => t.id)
    expect(new Set(ids).size).toBe(3)
  })
})
