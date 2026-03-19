import { describe, it, expect } from 'vitest'

/**
 * Tests for useNavigation composable.
 *
 * Since it uses module-level refs (singleton state),
 * we test the functions directly.
 */

const { useNavigation } = await import('../../src/composables/useNavigation.js')

describe('useNavigation', () => {
  let nav

  beforeEach(() => {
    nav = useNavigation()
    nav.page.value = 'dashboard'
    nav.modalStack.value = []
  })

  describe('singleton', () => {
    it('returns the same refs across calls', () => {
      const a = useNavigation()
      const b = useNavigation()
      expect(a.page).toBe(b.page)
      expect(a.modalStack).toBe(b.modalStack)
    })
  })

  describe('page navigation', () => {
    it('goToPage navigates to a valid page', () => {
      nav.goToPage('library')
      expect(nav.page.value).toBe('library')
    })

    it('goToPage ignores invalid page names', () => {
      nav.goToPage('nonexistent')
      expect(nav.page.value).toBe('dashboard')
    })

    it('goBack moves from lyrics to library', () => {
      nav.goToPage('lyrics')
      nav.goBack()
      expect(nav.page.value).toBe('library')
    })

    it('goBack moves from library to dashboard', () => {
      nav.goToPage('library')
      nav.goBack()
      expect(nav.page.value).toBe('dashboard')
    })

    it('goBack does nothing on dashboard', () => {
      nav.goBack()
      expect(nav.page.value).toBe('dashboard')
    })
  })

  describe('modal stack', () => {
    it('pushModal adds to stack', () => {
      nav.pushModal('settings')
      expect(nav.modalStack.value).toEqual(['settings'])
      expect(nav.topModal.value).toBe('settings')
      expect(nav.hasModal.value).toBe(true)
    })

    it('pushModal does not duplicate topmost modal', () => {
      nav.pushModal('settings')
      nav.pushModal('settings')
      expect(nav.modalStack.value).toEqual(['settings'])
    })

    it('pushModal allows stacking different modals', () => {
      nav.pushModal('settings')
      nav.pushModal('kanban')
      expect(nav.modalStack.value).toEqual(['settings', 'kanban'])
      expect(nav.topModal.value).toBe('kanban')
    })

    it('popModal removes topmost modal', () => {
      nav.pushModal('settings')
      nav.pushModal('kanban')
      nav.popModal()
      expect(nav.modalStack.value).toEqual(['settings'])
    })

    it('closeModal removes a specific modal', () => {
      nav.pushModal('settings')
      nav.pushModal('kanban')
      nav.closeModal('settings')
      expect(nav.modalStack.value).toEqual(['kanban'])
    })

    it('isModalOpen returns true for open modals', () => {
      nav.pushModal('randomizer')
      expect(nav.isModalOpen('randomizer')).toBe(true)
      expect(nav.isModalOpen('settings')).toBe(false)
    })

    it('topModal returns null when stack is empty', () => {
      expect(nav.topModal.value).toBeNull()
    })

    it('hasModal returns false when stack is empty', () => {
      expect(nav.hasModal.value).toBe(false)
    })
  })

  describe('dismissTop', () => {
    it('pops modal when modal is open', () => {
      nav.pushModal('kanban')
      nav.dismissTop()
      expect(nav.modalStack.value).toEqual([])
    })

    it('goes back a page when no modal is open', () => {
      nav.goToPage('lyrics')
      nav.dismissTop()
      expect(nav.page.value).toBe('library')
    })

    it('prefers closing modal over page navigation', () => {
      nav.goToPage('lyrics')
      nav.pushModal('settings')
      nav.dismissTop()
      expect(nav.page.value).toBe('lyrics') // page unchanged
      expect(nav.modalStack.value).toEqual([]) // modal closed
    })
  })
})
