import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useToastStore = defineStore('toast', () => {
  const toasts = ref([])
  let nextId = 0

  function showToast(message, { type = 'error', duration = 4000 } = {}) {
    const id = nextId++
    toasts.value.push({ id, message, type })
    if (duration > 0) {
      setTimeout(() => dismissToast(id), duration)
    }
    return id
  }

  function updateToast(id, message, type) {
    const toast = toasts.value.find(t => t.id === id)
    if (toast) {
      if (message !== undefined) toast.message = message
      if (type !== undefined) toast.type = type
    }
  }

  function dismissToast(id) {
    const idx = toasts.value.findIndex(t => t.id === id)
    if (idx >= 0) toasts.value.splice(idx, 1)
  }

  return { toasts, showToast, updateToast, dismissToast }
})
