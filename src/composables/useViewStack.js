import { ref, computed } from 'vue'

/**
 * Manages overlay views as a stack so Escape always closes
 * the topmost view and reveals whatever was underneath.
 *
 * View names: 'library', 'kanban', 'randomizer'
 */
export function useViewStack() {
  const viewStack = ref([])

  const currentView = computed(() => viewStack.value.at(-1) || null)

  function pushView(name) {
    if (currentView.value !== name) {
      viewStack.value = [...viewStack.value, name]
    }
  }

  function popView() {
    viewStack.value = viewStack.value.slice(0, -1)
  }

  function clearViews() {
    viewStack.value = []
  }

  function isOpen(name) {
    return viewStack.value.includes(name)
  }

  return { viewStack, currentView, pushView, popView, clearViews, isOpen }
}
