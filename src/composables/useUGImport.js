export function useUGImport(favorites, currentTitle, chordState) {
  let ugPollTimer = null

  function startUGImportPoll() {
    if (ugPollTimer) clearInterval(ugPollTimer)

    let attempts = 0
    const maxAttempts = 60 // 2 minutes at 2s intervals

    ugPollTimer = setInterval(async () => {
      attempts++
      if (attempts > maxAttempts) {
        clearInterval(ugPollTimer)
        ugPollTimer = null
        return
      }

      try {
        const res = await fetch('/api/import-chords')
        const data = await res.json()
        if (data.empty) return

        clearInterval(ugPollTimer)
        ugPollTimer = null

        if (data.sections && data.sections.length > 0) {
          chordState.chordSections.value = data.sections
          chordState.chordStructure.value = data.structure || ''
          chordState.chordsFound.value = true
          chordState.showChords.value = true

          if (currentTitle.value) {
            const fav = favorites.value.find(f => f.title === currentTitle.value)
            if (fav) {
              fav.chordSections = data.sections
              fav.chordStructure = data.structure || ''
              if (data.capo) fav.capo = data.capo
              fav.customChords = data.sections
              fav.customStructure = data.structure || ''

              // Persist to DB
              if (fav.id) {
                fetch(`/api/songs/${fav.id}`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    customChords: data.sections,
                    customStructure: data.structure || '',
                    capo: data.capo || null,
                  }),
                })
              }
            }
          }
          console.log('UG import applied:', data.sections.length, 'sections')
        }
      } catch (e) {
        // Silently ignore polling errors
      }
    }, 2000)
  }

  function stopUGImportPoll() {
    if (ugPollTimer) {
      clearInterval(ugPollTimer)
      ugPollTimer = null
    }
  }

  return { startUGImportPoll, stopUGImportPoll }
}
