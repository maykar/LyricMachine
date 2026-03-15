import { onMounted, onUnmounted } from 'vue'

export function useKeyboard({
  editingLyrics,
  cancelEditMode,
  showLibrary,
  currentTitle,
  currentLyrics,
  showChords,
  showPlayer,
  startUGImportPoll,
  goHome,
  openRandomizer,
}) {
  function onKeydown(e) {
    if (e.ctrlKey || e.altKey || e.metaKey) return
    const tag = e.target.tagName

    if (tag === 'INPUT' || tag === 'TEXTAREA') {
      if (e.key === 'Escape') {
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
        if (!showLibrary.value) {
          showLibrary.value = true
        }
        break

      case 'Escape':
        if (showLibrary.value) {
          // Library open → go home (Dashboard)
          goHome()
        } else if (currentLyrics.value) {
          // Lyrics view → open Library (go back to browse)
          showLibrary.value = true
        }
        break

      case 't':
      case 'T':
        if (!showLibrary.value) {
          fetch(`/api/open-ug?q=${encodeURIComponent(currentTitle.value)}`)
          startUGImportPoll()
        }
        break

      case 'c':
      case 'C':
        if (!showLibrary.value && currentLyrics.value) {
          showChords.value = !showChords.value
        }
        break

      case 'p':
      case 'P':
        if (!showLibrary.value && currentLyrics.value) {
          showPlayer.value = !showPlayer.value
        }
        break

      case 'r':
      case 'R':
        openRandomizer()
        break
    }
  }

  onMounted(() => window.addEventListener('keydown', onKeydown))
  onUnmounted(() => window.removeEventListener('keydown', onKeydown))
}
