import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'

// Shared state for mock
const toasts = ref([])
const dismissToast = vi.fn((id) => {
  toasts.value = toasts.value.filter(t => t.id !== id)
})

// Mock useToast before importing ToastContainer
vi.mock('../../src/composables/useToast.js', () => ({
  useToast: () => ({ toasts, showToast: vi.fn(), dismissToast }),
}))

const { useToast } = await import('../../src/composables/useToast.js')
const ToastContainer = (await import('../../src/components/ToastContainer.vue')).default

describe('ToastContainer', () => {
  let toasts, dismissToast

  beforeEach(() => {
    const toast = useToast()
    toasts = toast.toasts
    dismissToast = toast.dismissToast
    toasts.value = []
  })

  it('renders no toasts when empty', () => {
    const wrapper = mount(ToastContainer, { global: { stubs: { Teleport: true } } })
    expect(wrapper.findAll('.toast-item')).toHaveLength(0)
  })

  it('renders toast messages', async () => {
    toasts.value = [
      { id: 1, message: 'Error occurred', type: 'error' },
      { id: 2, message: 'Success!', type: 'success' },
    ]
    const wrapper = mount(ToastContainer, { global: { stubs: { Teleport: true } } })
    const items = wrapper.findAll('.toast-item')
    expect(items).toHaveLength(2)
    expect(items[0].text()).toBe('Error occurred')
    expect(items[1].text()).toBe('Success!')
  })

  it('applies type-specific CSS classes', () => {
    toasts.value = [
      { id: 1, message: 'Error', type: 'error' },
      { id: 2, message: 'Success', type: 'success' },
      { id: 3, message: 'Info', type: 'info' },
    ]
    const wrapper = mount(ToastContainer, { global: { stubs: { Teleport: true } } })
    const items = wrapper.findAll('.toast-item')
    expect(items[0].classes()).toContain('toast--error')
    expect(items[1].classes()).toContain('toast--success')
    expect(items[2].classes()).toContain('toast--info')
  })

  it('calls dismissToast on click', async () => {
    toasts.value = [{ id: 42, message: 'Click me', type: 'info' }]
    const wrapper = mount(ToastContainer, { global: { stubs: { Teleport: true } } })
    await wrapper.find('.toast-item').trigger('click')
    expect(dismissToast).toHaveBeenCalledWith(42)
  })
})
