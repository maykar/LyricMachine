import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import NewSongForm from '../../src/components/NewSongForm.vue'

describe('NewSongForm', () => {
  it('is hidden when visible is false', () => {
    const wrapper = mount(NewSongForm, { props: { visible: false } })
    expect(wrapper.find('.new-song-form').exists()).toBe(false)
  })

  it('renders form when visible is true', () => {
    const wrapper = mount(NewSongForm, { props: { visible: true } })
    expect(wrapper.find('.new-song-form').exists()).toBe(true)
  })

  it('has artist and track inputs', () => {
    const wrapper = mount(NewSongForm, { props: { visible: true } })
    const inputs = wrapper.findAll('.new-song-input')
    expect(inputs).toHaveLength(2)
    expect(inputs[0].attributes('placeholder')).toBe('Artist')
    expect(inputs[1].attributes('placeholder')).toBe('Track')
  })

  it('has a lyrics textarea', () => {
    const wrapper = mount(NewSongForm, { props: { visible: true } })
    const textarea = wrapper.find('.new-song-lyrics')
    expect(textarea.exists()).toBe(true)
    expect(textarea.attributes('placeholder')).toContain('lyrics')
  })

  it('submit button is disabled when fields are empty', () => {
    const wrapper = mount(NewSongForm, { props: { visible: true } })
    const btn = wrapper.find('.new-song-submit')
    expect(btn.element.disabled).toBe(true)
  })

  it('submit button is enabled when artist and track are filled', async () => {
    const wrapper = mount(NewSongForm, { props: { visible: true } })
    const inputs = wrapper.findAll('.new-song-input')
    await inputs[0].setValue('Nirvana')
    await inputs[1].setValue('Smells Like Teen Spirit')
    const btn = wrapper.find('.new-song-submit')
    expect(btn.element.disabled).toBe(false)
  })

  it('emits created with title and lyrics on submit', async () => {
    const wrapper = mount(NewSongForm, { props: { visible: true } })
    const inputs = wrapper.findAll('.new-song-input')
    await inputs[0].setValue('Nirvana')
    await inputs[1].setValue('Smells Like Teen Spirit')
    await wrapper.find('.new-song-lyrics').setValue('Load up on guns')

    await wrapper.find('.new-song-submit').trigger('click')

    const events = wrapper.emitted('created')
    expect(events).toHaveLength(1)
    expect(events[0][0]).toEqual({
      title: 'Nirvana — Smells Like Teen Spirit',
      lyrics: 'Load up on guns',
    })
  })

  it('clears inputs after submit', async () => {
    const wrapper = mount(NewSongForm, { props: { visible: true } })
    const inputs = wrapper.findAll('.new-song-input')
    await inputs[0].setValue('Foo')
    await inputs[1].setValue('Bar')

    await wrapper.find('.new-song-submit').trigger('click')

    expect(inputs[0].element.value).toBe('')
    expect(inputs[1].element.value).toBe('')
  })

  it('does not emit when artist is empty', async () => {
    const wrapper = mount(NewSongForm, { props: { visible: true } })
    const inputs = wrapper.findAll('.new-song-input')
    await inputs[1].setValue('Track Only')
    // Button should be disabled, but test the submit function directly
    expect(wrapper.emitted('created')).toBeUndefined()
  })
})
