import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

/**
 * Unified navigation: 3 pages + modal stack.
 *
 * Pages (linear, Escape goes back):
 *   dashboard → library → lyrics
 *
 * Modals (stack, Escape pops topmost):
 *   settings, kanban, randomizer
 *
 * Rule: dismissTop() closes topmost modal first,
 *       then goes back one page if no modal is open.
 *
 * History API: every page/modal change pushes browser history state,
 * so the device back button (or browser back) calls dismissTop()
 * instead of leaving the app.
 */

const PAGES = ['dashboard', 'library', 'lyrics']

export const useNavigationStore = defineStore('navigation', () => {
  const page = ref('dashboard')
  const modalStack = ref([])

  // Flag to suppress pushState when we're handling a popstate event
  let _handlingPopstate = false

  // --- History API helpers ---

  /** Build a serializable snapshot of current navigation state */
  function _stateSnapshot() {
    return { page: page.value, modals: [...modalStack.value] }
  }

  /** Push current state to browser history (unless we're handling popstate) */
  function _pushHistory() {
    if (_handlingPopstate) return
    try {
      window.history.pushState(_stateSnapshot(), '')
    } catch { /* SSR / test env — ignore */ }
  }

  /** Replace current history entry with fresh state (no new entry) */
  function _replaceHistory() {
    try {
      window.history.replaceState(_stateSnapshot(), '')
    } catch { /* SSR / test env — ignore */ }
  }

  // --- Page navigation ---

  function goToPage(name) {
    if (PAGES.includes(name)) {
      page.value = name
      _pushHistory()
    }
  }

  function goBack() {
    const idx = PAGES.indexOf(page.value)
    if (idx > 0) {
      page.value = PAGES[idx - 1]
      _replaceHistory()
    }
  }

  // --- Modal stack ---

  const topModal = computed(() => modalStack.value.at(-1) || null)
  const hasModal = computed(() => modalStack.value.length > 0)

  function pushModal(name) {
    if (topModal.value !== name) {
      modalStack.value = [...modalStack.value, name]
      _pushHistory()
    }
  }

  function closeModal(name) {
    modalStack.value = modalStack.value.filter(m => m !== name)
    _replaceHistory()
  }

  function popModal() {
    modalStack.value = modalStack.value.slice(0, -1)
    _replaceHistory()
  }

  function isModalOpen(name) {
    return modalStack.value.includes(name)
  }

  // --- Unified dismiss ---

  function dismissTop() {
    if (hasModal.value) {
      popModal()
    } else {
      goBack()
    }
  }

  // --- History API: popstate listener ---

  function initHistory() {
    // Seed the initial history entry so there's always something to go back to
    _replaceHistory()

    window.addEventListener('popstate', () => {
      _handlingPopstate = true
      try {
        dismissTop()
      } finally {
        // Replace the entry we just landed on with our actual state
        // (popstate consumed a history entry, we don't re-push)
        _replaceHistory()
        _handlingPopstate = false
      }
    })
  }

  return {
    // Page
    page,
    goToPage,
    goBack,

    // Modals
    modalStack,
    topModal,
    hasModal,
    pushModal,
    closeModal,
    popModal,
    isModalOpen,

    // Unified
    dismissTop,

    // History
    initHistory,
  }
})
