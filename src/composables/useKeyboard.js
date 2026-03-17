import { useEventListener } from '@vueuse/core'

/**
 * Global keyboard shortcuts.
 *
 * Escape: dismissTop() handles everything —
 *   modal open → close it; no modal → go back one page.
 *
 * All shortcut keys blocked when any modal is open.
 */
export function useKeyboard({
  editingLyrics,
  cancelEditMode,
  page,
  hasModal,
  dismissTop,
  goToPage,
  pushModal,
  showChords,
  showPlayer,
  currentTitle,
  currentLyrics,
  startUGImportPoll,
}) {
  function onKeydown(e) {
    if (e.ctrlKey || e.altKey || e.metaKey) return
    const tag = e.target.tagName

    // --- Input/Textarea: only Escape to blur or cancel edit ---
    if (tag === 'INPUT' || tag === 'TEXTAREA') {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopImmediatePropagation()
        if (editingLyrics.value) {
          cancelEditMode()
        } else {
          e.target.blur()
        }
      }
      return
    }

    // --- Escape: unified dismiss ---
    if (e.key === 'Escape') {
      e.preventDefault()
      dismissTop()
      return
    }

    // --- Block all shortcuts when a modal is open ---
    if (hasModal.value) return

    switch (e.key) {
      case ' ':
        e.preventDefault()
        if (page.value === 'dashboard') {
          goToPage('library')
        }
        break

      case 't':
      case 'T':
        if (page.value === 'lyrics') {
          fetch(`/api/open-ug?q=${encodeURIComponent(currentTitle.value)}`)
          startUGImportPoll()
        }
        break

      case 'c':
      case 'C':
        if (page.value === 'lyrics') {
          showChords.value = !showChords.value
        }
        break

      case 'p':
      case 'P':
        if (page.value === 'lyrics') {
          showPlayer.value = !showPlayer.value
        }
        break

      case 'r':
      case 'R':
        pushModal('randomizer')
        break
    }
  }

  useEventListener(window, 'keydown', onKeydown)
}
