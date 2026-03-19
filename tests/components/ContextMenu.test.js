import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ContextMenu from '../../src/components/ContextMenu.vue'

// Mock MdiIcon to avoid SVG rendering issues in tests
vi.mock('../../src/components/MdiIcon.vue', () => ({
  default: {
    template: '<span class="mock-icon"></span>',
    props: ['path', 'size'],
  },
}))

const defaultProps = {
  show: true,
  x: 100,
  y: 200,
  fav: { label: 'fresh', playCount: 3, notInPlaylist: false },
}

describe('ContextMenu', () => {
  it('is hidden when show is false', () => {
    const wrapper = mount(ContextMenu, { props: { ...defaultProps, show: false } })
    expect(wrapper.find('.ctx-menu').exists()).toBe(false)
  })

  it('renders when show is true', () => {
    const wrapper = mount(ContextMenu, { props: defaultProps })
    expect(wrapper.find('.ctx-menu').exists()).toBe(true)
  })

  it('renders all 3 label options', () => {
    const wrapper = mount(ContextMenu, { props: defaultProps })
    const options = wrapper.findAll('.ctx-option')
    // Fresh, Getting There, In Setlist + Played + Edit Count + Clear Count + Remove = 7
    expect(options.length).toBeGreaterThanOrEqual(7)
  })

  it('marks active label', () => {
    const wrapper = mount(ContextMenu, { props: defaultProps })
    const activeOpts = wrapper.findAll('.ctx-option.active')
    expect(activeOpts).toHaveLength(1)
    expect(activeOpts[0].text()).toBe('Fresh')
  })

  it('emits set-label on label click', async () => {
    const wrapper = mount(ContextMenu, { props: defaultProps })
    const options = wrapper.findAll('.ctx-option')
    // Click "Getting There" (index 1)
    await options[1].trigger('click')
    expect(wrapper.emitted('set-label')?.[0][0]).toBe('getting-there')
  })

  it('emits toggle-played on click', async () => {
    const wrapper = mount(ContextMenu, { props: defaultProps })
    const playedBtn = wrapper.findAll('.ctx-option').find(o => o.text().includes('Played'))
    await playedBtn.trigger('click')
    expect(wrapper.emitted('toggle-played')).toHaveLength(1)
  })

  it('shows play count in Played button', () => {
    const wrapper = mount(ContextMenu, { props: defaultProps })
    const playedBtn = wrapper.findAll('.ctx-option').find(o => o.text().includes('Played'))
    expect(playedBtn.text()).toContain('(3)')
  })

  it('emits delete on Remove click', async () => {
    const wrapper = mount(ContextMenu, { props: defaultProps })
    const deleteBtn = wrapper.find('.ctx-delete')
    await deleteBtn.trigger('click')
    expect(wrapper.emitted('delete')).toHaveLength(1)
  })

  it('shows add-to-source when notInPlaylist is true', () => {
    const wrapper = mount(ContextMenu, {
      props: { ...defaultProps, fav: { ...defaultProps.fav, notInPlaylist: true } },
    })
    const addBtn = wrapper.findAll('.ctx-option').find(o => o.text().includes('Add to source'))
    expect(addBtn).toBeDefined()
  })

  it('hides add-to-source when notInPlaylist is false', () => {
    const wrapper = mount(ContextMenu, { props: defaultProps })
    const addBtn = wrapper.findAll('.ctx-option').find(o => o.text().includes('Add to source'))
    expect(addBtn).toBeUndefined()
  })

  it('positions at x/y coordinates', () => {
    const wrapper = mount(ContextMenu, { props: defaultProps })
    const style = wrapper.find('.ctx-menu').attributes('style')
    expect(style).toContain('top: 200px')
    expect(style).toContain('left: 100px')
  })
})
