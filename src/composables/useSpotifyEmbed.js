/**
 * useSpotifyEmbed — IFrame Embed API fallback for Spotify playback.
 *
 * Uses Spotify's Embed IFrame API (no Premium required) to play 30-second
 * previews via a hidden off-screen controller. Used as a fallback when the
 * Web Playback SDK is not available (user not logged in / no Premium).
 *
 * Lifecycle:
 *   warmUp()          → creates hidden iframe controller (call on mount)
 *   preload(trackId)  → swaps the loaded track without playing
 *   play()            → starts playback
 *   pause()           → pauses playback
 *   destroy()         → tears down the controller + DOM (call on unmount)
 *   isReady()         → true if the controller has a track loaded and ready
 */

// Module-level state on window so it survives component unmount/remount
const _emb = window.__spotifyEmbed || (window.__spotifyEmbed = {
  api: null,
  ctrl: null,
  ready: false,
  warm: false,
  _scriptInjected: false,
})

// Inject the IFrame API script once globally
if (!_emb._scriptInjected) {
  _emb._scriptInjected = true
  if (!document.querySelector('script[src*="spotify.com/embed/iframe-api"]')) {
    const s = document.createElement('script')
    s.src = 'https://open.spotify.com/embed/iframe-api/v1'
    s.async = true
    document.body.appendChild(s)
  }
  // Capture the API when it's ready (only if SDK hasn't already claimed this callback)
  const existingCb = window.onSpotifyIframeApiReady
  window.onSpotifyIframeApiReady = (IFrameAPI) => {
    _emb.api = IFrameAPI
    if (existingCb) existingCb(IFrameAPI)
  }
}

function getOrCreateWrapper() {
  let wrapper = document.getElementById('embed-spotify-wrap')
  if (wrapper) return wrapper.querySelector('div') || wrapper

  wrapper = document.createElement('div')
  wrapper.id = 'embed-spotify-wrap'
  wrapper.style.cssText = 'position:fixed;bottom:-200px;left:-200px;width:300px;height:80px;overflow:hidden;pointer-events:none;opacity:0;'
  document.body.appendChild(wrapper)

  const el = document.createElement('div')
  wrapper.appendChild(el)
  return el
}

function removeWrapper() {
  const wrap = document.getElementById('embed-spotify-wrap')
  if (wrap) wrap.remove()
}

export function useSpotifyEmbed() {

  /**
   * Creates a hidden IFrame embed controller pre-loaded with a dummy track.
   * Call this on mount so the controller is warm by spin time.
   */
  function warmUp() {
    if (_emb.ctrl) return  // already warm

    const el = getOrCreateWrapper()

    function doWarmUp(IFrameAPI) {
      IFrameAPI.createController(el, {
        uri: 'spotify:track:4cOdK2wGLETKBW3PvgPWqT', // dummy track to init
        width: 300,
        height: 80,
      }, (controller) => {
        _emb.ctrl = controller
        _emb.warm = true
      })
    }

    if (_emb.api) {
      doWarmUp(_emb.api)
    } else {
      // Wait for the API to load
      const prevCb = window.onSpotifyIframeApiReady
      window.onSpotifyIframeApiReady = (IFrameAPI) => {
        _emb.api = IFrameAPI
        doWarmUp(IFrameAPI)
        if (prevCb && prevCb !== window.onSpotifyIframeApiReady) prevCb(IFrameAPI)
      }
    }
  }

  /**
   * Load a track into the controller without playing it.
   * Calls the `ready` callback when the track is buffered.
   * If the controller is still warming up, creates one from scratch.
   */
  function preload(trackId) {
    const uri = `spotify:track:${trackId}`
    _emb.ready = false

    if (_emb.ctrl) {
      // Controller is warm — just swap the track
      _emb.ctrl.loadUri(uri)
      _emb.ctrl.addListener('ready', () => {
        _emb.ready = true
      })
      return
    }

    // Fallback: create from scratch
    const el = getOrCreateWrapper()

    function createEmbed(IFrameAPI) {
      IFrameAPI.createController(el, {
        uri,
        width: 300,
        height: 80,
      }, (controller) => {
        _emb.ctrl = controller
        controller.addListener('ready', () => {
          _emb.ready = true
        })
      })
    }

    if (_emb.api) {
      createEmbed(_emb.api)
    } else {
      const prevCb = window.onSpotifyIframeApiReady
      window.onSpotifyIframeApiReady = (IFrameAPI) => {
        _emb.api = IFrameAPI
        createEmbed(IFrameAPI)
        if (prevCb && prevCb !== window.onSpotifyIframeApiReady) prevCb(IFrameAPI)
      }
    }
  }

  /** Start playback on the embed controller. */
  function play() {
    if (_emb.ctrl) {
      try { _emb.ctrl.play() } catch {}
    }
  }

  /** Pause playback on the embed controller. */
  function pause() {
    if (_emb.ctrl) {
      try { _emb.ctrl.pause() } catch {}
    }
  }

  /** Returns true if a track is loaded and ready to play. */
  function isReady() {
    return _emb.ready
  }

  /** Fully destroy the controller and remove the DOM wrapper. */
  function destroy() {
    if (_emb.ctrl) {
      try { _emb.ctrl.destroy() } catch {}
      _emb.ctrl = null
    }
    _emb.ready = false
    _emb.warm = false
    removeWrapper()
  }

  return { warmUp, preload, play, pause, isReady, destroy }
}
