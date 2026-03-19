import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import MdiIcon from '../../src/components/MdiIcon.vue'

const TEST_PATH = 'M12 2L1 21h22L12 2z' // simple triangle

describe('MdiIcon', () => {
  it('renders an SVG element', () => {
    const wrapper = mount(MdiIcon, { props: { path: TEST_PATH } })
    expect(wrapper.find('svg').exists()).toBe(true)
  })

  it('renders the path', () => {
    const wrapper = mount(MdiIcon, { props: { path: TEST_PATH } })
    expect(wrapper.find('path').attributes('d')).toBe(TEST_PATH)
  })

  it('sets default size to 1.25rem (20/16)', () => {
    const wrapper = mount(MdiIcon, { props: { path: TEST_PATH } })
    const svg = wrapper.find('svg')
    expect(svg.attributes('width')).toBe('1.25rem')
    expect(svg.attributes('height')).toBe('1.25rem')
  })

  it('accepts custom size', () => {
    const wrapper = mount(MdiIcon, { props: { path: TEST_PATH, size: 32 } })
    const svg = wrapper.find('svg')
    expect(svg.attributes('width')).toBe('2rem')
    expect(svg.attributes('height')).toBe('2rem')
  })

  it('has viewBox 0 0 24 24', () => {
    const wrapper = mount(MdiIcon, { props: { path: TEST_PATH } })
    const svg = wrapper.find('svg')
    // happy-dom lowercases attributes, check element directly
    expect(svg.element.getAttribute('viewBox')).toBe('0 0 24 24')
  })

  it('uses currentColor for fill', () => {
    const wrapper = mount(MdiIcon, { props: { path: TEST_PATH } })
    expect(wrapper.find('path').attributes('fill')).toBe('currentColor')
  })
})
