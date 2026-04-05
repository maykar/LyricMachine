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
 */

const PAGES = ['dashboard', 'library', 'lyrics']

export const useNavigationStore = defineStore('navigation', () => {
  const page = ref('dashboard')
  const modalStack = ref([])

  // --- Page navigation ---

  function goToPage(name) {
    if (PAGES.includes(name)) {
      page.value = name
    }
  }

  function goBack() {
    const idx = PAGES.indexOf(page.value)
    if (idx > 0) {
      page.value = PAGES[idx - 1]
    }
  }

  // --- Modal stack ---

  const topModal = computed(() => modalStack.value.at(-1) || null)
  const hasModal = computed(() => modalStack.value.length > 0)

  function pushModal(name) {
    if (topModal.value !== name) {
      modalStack.value = [...modalStack.value, name]
    }
  }

  function closeModal(name) {
    modalStack.value = modalStack.value.filter(m => m !== name)
  }

  function popModal() {
    modalStack.value = modalStack.value.slice(0, -1)
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
  }
})
