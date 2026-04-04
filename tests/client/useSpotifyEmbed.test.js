import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useSpotifyEmbed } from '../../src/composables/useSpotifyEmbed.js'

beforeEach(() => {
  // Reset module-level state
  if (window.__spotifyEmbed) {
    window.__spotifyEmbed.ctrl = null
    window.__spotifyEmbed.ready = false
    window.__spotifyEmbed.warm = false
  }
  // Clean up DOM
  document.querySelectorAll('#embed-spotify-wrap').forEach(el => el.remove())
})

afterEach(() => {
  document.querySelectorAll('#embed-spotify-wrap').forEach(el => el.remove())
})

describe('useSpotifyEmbed', () => {
  it('exports warmUp, preload, play, pause, isReady, destroy', () => {
    const embed = useSpotifyEmbed()
    expect(typeof embed.warmUp).toBe('function')
    expect(typeof embed.preload).toBe('function')
    expect(typeof embed.play).toBe('function')
    expect(typeof embed.pause).toBe('function')
    expect(typeof embed.isReady).toBe('function')
    expect(typeof embed.destroy).toBe('function')
  })

  it('isReady returns false initially', () => {
    const embed = useSpotifyEmbed()
    expect(embed.isReady()).toBe(false)
  })

  it('play and pause do not throw when no controller exists', () => {
    const embed = useSpotifyEmbed()
    expect(() => embed.play()).not.toThrow()
    expect(() => embed.pause()).not.toThrow()
  })

  it('destroy removes the DOM wrapper', () => {
    const embed = useSpotifyEmbed()
    // Simulate a wrapper existing
    const wrapper = document.createElement('div')
    wrapper.id = 'embed-spotify-wrap'
    document.body.appendChild(wrapper)
    expect(document.getElementById('embed-spotify-wrap')).not.toBeNull()

    embed.destroy()
    expect(document.getElementById('embed-spotify-wrap')).toBeNull()
  })

  it('destroy resets ready and warm state', () => {
    const embed = useSpotifyEmbed()
    const _emb = window.__spotifyEmbed
    _emb.ready = true
    _emb.warm = true
    _emb.ctrl = { destroy: vi.fn() }

    embed.destroy()
    expect(_emb.ready).toBe(false)
    expect(_emb.warm).toBe(false)
    expect(_emb.ctrl).toBeNull()
  })

  it('warmUp creates the DOM wrapper element', () => {
    const embed = useSpotifyEmbed()
    const _emb = window.__spotifyEmbed
    _emb.api = {
      createController: vi.fn((el, opts, cb) => {
        cb({ destroy: vi.fn() })
      })
    }

    embed.warmUp()
    const wrapper = document.getElementById('embed-spotify-wrap')
    expect(wrapper).not.toBeNull()
    expect(wrapper.style.opacity).toBe('0')
  })

  it('warmUp does not create duplicate controllers', () => {
    const embed = useSpotifyEmbed()
    const _emb = window.__spotifyEmbed
    const createController = vi.fn((el, opts, cb) => {
      cb({ destroy: vi.fn() })
    })
    _emb.api = { createController }

    embed.warmUp()
    embed.warmUp()
    expect(createController).toHaveBeenCalledTimes(1)
  })

  it('preload sets ready to true via the ready listener', () => {
    const embed = useSpotifyEmbed()
    const _emb = window.__spotifyEmbed
    const listeners = {}
    _emb.ctrl = {
      loadUri: vi.fn(),
      addListener: vi.fn((event, cb) => { listeners[event] = cb }),
      destroy: vi.fn(),
    }

    embed.preload('test-track-id')
    expect(_emb.ctrl.loadUri).toHaveBeenCalledWith('spotify:track:test-track-id')
    expect(embed.isReady()).toBe(false)

    // Simulate the ready event
    listeners.ready()
    expect(embed.isReady()).toBe(true)
  })

  it('play calls ctrl.play()', () => {
    const embed = useSpotifyEmbed()
    const _emb = window.__spotifyEmbed
    _emb.ctrl = { play: vi.fn(), destroy: vi.fn() }

    embed.play()
    expect(_emb.ctrl.play).toHaveBeenCalled()
  })

  it('pause calls ctrl.pause()', () => {
    const embed = useSpotifyEmbed()
    const _emb = window.__spotifyEmbed
    _emb.ctrl = { pause: vi.fn(), destroy: vi.fn() }

    embed.pause()
    expect(_emb.ctrl.pause).toHaveBeenCalled()
  })
})
