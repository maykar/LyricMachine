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
}) {
  function onKeydown(e) {
    const tag = e.target.tagName

    if (tag === 'INPUT' || tag === 'TEXTAREA') {
      if (e.key === 'Escape') {
        if (editingLyrics.value) {
          cancelEditMode()
        } else {
          showLibrary.value = false
        }
      }
      return
    }

    switch (e.key) {
      case ' ':
        e.preventDefault()
        showLibrary.value = !showLibrary.value
        break

      case 'Escape':
        showLibrary.value = false
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
    }
  }

  onMounted(() => window.addEventListener('keydown', onKeydown))
  onUnmounted(() => window.removeEventListener('keydown', onKeydown))
}
