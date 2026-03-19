import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref } from 'vue'

/**
 * Tests for useKeyboard composable.
 *
 * We mock the dependencies and call the onKeydown handler directly
 * since useEventListener attaches to window.
 */

// Mock @vueuse/core to capture the handler
let capturedHandler = null
vi.mock('@vueuse/core', () => ({
  useEventListener: (_target, _event, handler) => {
    capturedHandler = handler
  },
}))

const { useKeyboard } = await import('../../src/composables/useKeyboard.js')

function makeEvent(key, overrides = {}) {
  return {
    key,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    target: { tagName: 'DIV' },
    preventDefault: vi.fn(),
    stopImmediatePropagation: vi.fn(),
    ...overrides,
  }
}

describe('useKeyboard', () => {
  let deps

  beforeEach(() => {
    capturedHandler = null
    deps = {
      editingLyrics: ref(false),
      cancelEditMode: vi.fn(),
      page: ref('dashboard'),
      hasModal: ref(false),
      dismissTop: vi.fn(),
      goToPage: vi.fn(),
      pushModal: vi.fn(),
      showChords: ref(false),
      showPlayer: ref(false),
      currentTitle: ref('Artist — Track'),
      currentLyrics: ref('lyrics'),
      startUGImportPoll: vi.fn(),
    }
    // Mock fetch for UG import
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true })
    useKeyboard(deps)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('registers a keydown handler', () => {
    expect(capturedHandler).toBeInstanceOf(Function)
  })

  it('ignores events with modifier keys', () => {
    capturedHandler(makeEvent('Escape', { ctrlKey: true }))
    expect(deps.dismissTop).not.toHaveBeenCalled()
  })

  describe('input/textarea focus', () => {
    it('blurs input on Escape', () => {
      const blur = vi.fn()
      const e = makeEvent('Escape', { target: { tagName: 'INPUT', blur } })
      capturedHandler(e)
      expect(blur).toHaveBeenCalled()
      expect(e.preventDefault).toHaveBeenCalled()
    })

    it('calls cancelEditMode when editing lyrics and Escape pressed in textarea', () => {
      deps.editingLyrics.value = true
      const e = makeEvent('Escape', { target: { tagName: 'TEXTAREA', blur: vi.fn() } })
      capturedHandler(e)
      expect(deps.cancelEditMode).toHaveBeenCalled()
    })

    it('ignores non-Escape keys in inputs', () => {
      const e = makeEvent('r', { target: { tagName: 'INPUT' } })
      capturedHandler(e)
      expect(deps.pushModal).not.toHaveBeenCalled()
    })
  })

  describe('Escape key', () => {
    it('calls dismissTop', () => {
      capturedHandler(makeEvent('Escape'))
      expect(deps.dismissTop).toHaveBeenCalled()
    })
  })

  describe('shortcuts blocked by modal', () => {
    it('blocks Space when modal is open', () => {
      deps.hasModal.value = true
      capturedHandler(makeEvent(' '))
      expect(deps.goToPage).not.toHaveBeenCalled()
    })

    it('blocks R when modal is open', () => {
      deps.hasModal.value = true
      capturedHandler(makeEvent('r'))
      expect(deps.pushModal).not.toHaveBeenCalled()
    })
  })

  describe('Space key', () => {
    it('goes to library from dashboard', () => {
      capturedHandler(makeEvent(' '))
      expect(deps.goToPage).toHaveBeenCalledWith('library')
    })

    it('does nothing on lyrics page', () => {
      deps.page.value = 'lyrics'
      capturedHandler(makeEvent(' '))
      expect(deps.goToPage).not.toHaveBeenCalled()
    })
  })

  describe('R key', () => {
    it('opens randomizer modal', () => {
      capturedHandler(makeEvent('r'))
      expect(deps.pushModal).toHaveBeenCalledWith('randomizer')
    })

    it('works with uppercase R', () => {
      capturedHandler(makeEvent('R'))
      expect(deps.pushModal).toHaveBeenCalledWith('randomizer')
    })
  })

  describe('lyrics page shortcuts', () => {
    beforeEach(() => {
      deps.page.value = 'lyrics'
    })

    it('T starts UG import poll', () => {
      capturedHandler(makeEvent('t'))
      expect(deps.startUGImportPoll).toHaveBeenCalled()
    })

    it('C toggles chords', () => {
      deps.showChords.value = false
      capturedHandler(makeEvent('c'))
      expect(deps.showChords.value).toBe(true)
    })

    it('P toggles player', () => {
      deps.showPlayer.value = false
      capturedHandler(makeEvent('p'))
      expect(deps.showPlayer.value).toBe(true)
    })

    it('T does nothing on non-lyrics page', () => {
      deps.page.value = 'dashboard'
      capturedHandler(makeEvent('t'))
      expect(deps.startUGImportPoll).not.toHaveBeenCalled()
    })
  })
})
