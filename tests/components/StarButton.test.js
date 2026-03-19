import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import StarButton from '../../src/components/StarButton.vue'

describe('StarButton', () => {
  it('renders unsaved state by default', () => {
    const wrapper = mount(StarButton)
    expect(wrapper.text()).toBe('☆')
    expect(wrapper.classes()).not.toContain('saved')
  })

  it('renders saved state when isSaved is true', () => {
    const wrapper = mount(StarButton, { props: { isSaved: true } })
    expect(wrapper.text()).toBe('★')
    expect(wrapper.classes()).toContain('saved')
  })

  it('sets correct title for unsaved', () => {
    const wrapper = mount(StarButton, { props: { isSaved: false } })
    expect(wrapper.attributes('title')).toBe('Save to favorites')
  })

  it('sets correct title for saved', () => {
    const wrapper = mount(StarButton, { props: { isSaved: true } })
    expect(wrapper.attributes('title')).toBe('Remove from favorites')
  })

  it('emits toggle on click', async () => {
    const wrapper = mount(StarButton)
    await wrapper.trigger('click')
    expect(wrapper.emitted('toggle')).toHaveLength(1)
  })

  it('is a button element', () => {
    const wrapper = mount(StarButton)
    expect(wrapper.element.tagName).toBe('BUTTON')
  })
})
