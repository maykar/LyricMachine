import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref } from 'vue'

/**
 * Tests for useUGImport composable.
 */

vi.mock('../../src/api.js', () => ({
  api: {
    getImportChords: vi.fn(),
    updateSong: vi.fn(),
  },
}))

const { api } = await import('../../src/api.js')
const { useUGImport } = await import('../../src/composables/useUGImport.js')

describe('useUGImport', () => {
  let ug, favorites, currentTitle, chordState

  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    favorites = ref([])
    currentTitle = ref('')
    chordState = {
      chordSections: ref([]),
      chordStructure: ref(''),
      chordsFound: ref(false),
      showChords: ref(false),
    }
    ug = useUGImport(favorites, currentTitle, chordState)
    vi.clearAllMocks()
  })

  afterEach(() => {
    ug.stopUGImportPoll()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('polls every 2 seconds', () => {
    api.getImportChords.mockResolvedValue({ empty: true })
    ug.startUGImportPoll()

    vi.advanceTimersByTime(2000)
    expect(api.getImportChords).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(2000)
    expect(api.getImportChords).toHaveBeenCalledTimes(2)
  })

  it('stops after max attempts', async () => {
    api.getImportChords.mockResolvedValue({ empty: true })
    ug.startUGImportPoll()

    // Advance past max attempts (60 × 2s = 120s)
    for (let i = 0; i < 62; i++) {
      await vi.advanceTimersByTimeAsync(2000)
    }

    const callCount = api.getImportChords.mock.calls.length
    await vi.advanceTimersByTimeAsync(2000)
    // No more calls after timeout
    expect(api.getImportChords.mock.calls.length).toBe(callCount)
  })

  it('applies imported chords to chord state', async () => {
    const sections = [{ section: 'VERSE', chords: 'Am C G D' }]
    api.getImportChords.mockResolvedValue({
      sections,
      structure: 'VERSE',
    })

    ug.startUGImportPoll()
    await vi.advanceTimersByTimeAsync(2000)

    expect(chordState.chordSections.value).toEqual(sections)
    expect(chordState.chordStructure.value).toBe('VERSE')
    expect(chordState.chordsFound.value).toBe(true)
    expect(chordState.showChords.value).toBe(true)
  })

  it('saves imported chords to matching favorite', async () => {
    favorites.value = [{ id: 3, title: 'Foo — Bar' }]
    currentTitle.value = 'Foo — Bar'

    const sections = [{ section: 'CHORUS', chords: 'F G Am' }]
    api.getImportChords.mockResolvedValue({
      sections,
      structure: 'CHORUS',
      capo: 3,
    })

    ug.startUGImportPoll()
    await vi.advanceTimersByTimeAsync(2000)

    expect(favorites.value[0].customChords).toEqual(sections)
    expect(favorites.value[0].capo).toBe(3)
    expect(api.updateSong).toHaveBeenCalledWith(3, {
      customChords: sections,
      customStructure: 'CHORUS',
      capo: 3,
    })
  })

  it('stops polling after receiving data', async () => {
    api.getImportChords
      .mockResolvedValueOnce({ empty: true })
      .mockResolvedValueOnce({ sections: [{ section: 'V', chords: 'C' }], structure: 'V' })

    ug.startUGImportPoll()
    await vi.advanceTimersByTimeAsync(2000) // empty
    await vi.advanceTimersByTimeAsync(2000) // data received, stops

    const calls = api.getImportChords.mock.calls.length
    await vi.advanceTimersByTimeAsync(2000)
    expect(api.getImportChords.mock.calls.length).toBe(calls) // No more calls
  })

  it('stopUGImportPoll clears the timer', () => {
    api.getImportChords.mockResolvedValue({ empty: true })
    ug.startUGImportPoll()
    ug.stopUGImportPoll()

    vi.advanceTimersByTime(4000)
    expect(api.getImportChords).not.toHaveBeenCalled()
  })

  it('restarting poll clears previous timer', () => {
    api.getImportChords.mockResolvedValue({ empty: true })
    ug.startUGImportPoll()
    ug.startUGImportPoll() // restart

    vi.advanceTimersByTime(2000)
    // Should only have 1 call, not 2 (from two timers)
    expect(api.getImportChords).toHaveBeenCalledTimes(1)
  })

  it('silently ignores polling errors', async () => {
    api.getImportChords.mockRejectedValue(new Error('Network fail'))
    ug.startUGImportPoll()

    await vi.advanceTimersByTimeAsync(2000)
    // Should not throw, just continue polling
    await vi.advanceTimersByTimeAsync(2000)
    expect(api.getImportChords).toHaveBeenCalledTimes(2)
  })
})
