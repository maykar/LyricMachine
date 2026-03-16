import { useEventListener } from '@vueuse/core'

export function useKeyboard({
  editingLyrics,
  cancelEditMode,
  currentView,
  pushView,
  popView,
  goHome,
  currentTitle,
  currentLyrics,
  showChords,
  showPlayer,
  startUGImportPoll,
}) {
  function onKeydown(e) {
    if (e.ctrlKey || e.altKey || e.metaKey) return
    const tag = e.target.tagName

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

    switch (e.key) {
      case ' ':
        e.preventDefault()
        // Space: open Library from Dashboard or Lyrics (Randomizer handles its own Space)
        if (!currentView.value) {
          pushView('library')
        }
        break

      case 'Escape':
        if (currentView.value === 'kanban' || currentView.value === 'randomizer') {
          popView()
        } else if (currentView.value === 'library') {
          // Go back: if lyrics loaded, show them; otherwise go to dashboard
          if (currentLyrics.value) {
            popView()
          } else {
            goHome()
          }
        } else if (!currentView.value && currentLyrics.value) {
          // On lyrics page with no overlay — go back to library
          pushView('library')
        }
        break

      case 't':
      case 'T':
        if (!currentView.value) {
          fetch(`/api/open-ug?q=${encodeURIComponent(currentTitle.value)}`)
          startUGImportPoll()
        }
        break

      case 'c':
      case 'C':
        if (!currentView.value && currentLyrics.value) {
          showChords.value = !showChords.value
        }
        break

      case 'p':
      case 'P':
        if (!currentView.value && currentLyrics.value) {
          showPlayer.value = !showPlayer.value
        }
        break

      case 'r':
      case 'R':
        pushView('randomizer')
        break
    }
  }

  useEventListener(window, 'keydown', onKeydown)
}
