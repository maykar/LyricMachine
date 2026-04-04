/**
 * useSpotifySDK — Web Playback SDK initialization composable.
 *
 * Extracted from App.vue to keep the root component lean.
 * Initializes the Spotify Web Playback SDK once globally:
 *   - Injects the SDK script
 *   - Creates the Player instance with token auto-refresh
 *   - Registers all error/ready/autoplay listeners
 *   - Patches SDK iframes with autoplay permissions
 *   - Sets up global click/touch/key listeners for activateElement()
 *
 * All state lives on window.__spotify (survives HMR).
 * Call initSpotifySDK() once on app mount.
 */

import { api } from '../api.js'

export function useSpotifySDK() {
  function initSpotifySDK() {
    const _sp = window.__spotify || (window.__spotify = { player: null, deviceId: null, ready: false })

    if (_sp._init) return  // already initialized
    _sp._init = true

    window.onSpotifyWebPlaybackSDKReady = () => {
      const player = new window.Spotify.Player({
        name: 'LyricMachine Web Player',
        getOAuthToken: cb => {
          api.getSpotifyToken()
            .then(d => cb(d?.token || ''))
            .catch(() => cb(''))
        },
        volume: 1.0
      })

      player.addListener('ready', ({ device_id }) => {
        console.log('[Spotify SDK] Ready with Device ID', device_id)
        _sp.deviceId = device_id
        _sp.ready = true
      })

      player.addListener('not_ready', ({ device_id }) => {
        console.log('[Spotify SDK] Device ID has gone offline', device_id)
        _sp.ready = false
        _sp.deviceId = null
      })

      player.addListener('initialization_error', ({ message }) => { console.error('[Spotify SDK] INIT_ERROR:', message) })
      player.addListener('authentication_error', ({ message }) => { console.error('[Spotify SDK] AUTH_ERROR:', message) })
      player.addListener('account_error', ({ message }) => { console.error('[Spotify SDK] ACCOUNT_ERROR:', message) })
      player.addListener('playback_error', ({ message }) => { console.error('[Spotify SDK] PLAYBACK_ERROR:', message) })
      player.addListener('autoplay_failed', () => {
        console.warn('[Spotify SDK] AUTOPLAY_FAILED fired — calling resume() to force playback')
        player.resume().then(() => {
          console.log('[Spotify SDK] resume() after AUTOPLAY_FAILED — SUCCESS')
          player.getCurrentState().then(state => {
            if (state) {
              console.log('[Spotify SDK] STATE after resume:', {
                paused: state.paused,
                position: state.position,
                duration: state.duration,
                track: state.track_window?.current_track?.name,
                artist: state.track_window?.current_track?.artists?.[0]?.name,
              })
            } else {
              console.log('[Spotify SDK] STATE after resume: NULL (no active session)')
            }
          })
          player.getVolume().then(vol => {
            console.log('[Spotify SDK] VOLUME:', vol)
          })
        }).catch(err => console.error('[Spotify SDK] resume() after AUTOPLAY_FAILED — FAILED:', err))
      })

      player.connect().then(success => {
        if (success) {
          _sp.player = player
          console.log('[Spotify SDK] player.connect() succeeded, _sp.player set')

          // Patch SDK iframes: add allow="autoplay; encrypted-media" so the
          // cross-origin iframe from sdk.scdn.co can play DRM audio.
          const patchIframes = () => {
            document.querySelectorAll('iframe').forEach(iframe => {
              if (iframe.src && iframe.src.includes('spotify') && !iframe.allow?.includes('autoplay')) {
                iframe.allow = 'autoplay; encrypted-media'
                console.log('[Spotify SDK] Patched iframe with autoplay permission:', iframe.src.substring(0, 80))
              }
            })
          }
          patchIframes()
          const obs = new MutationObserver(patchIframes)
          obs.observe(document.body, { childList: true, subtree: true })
        } else {
          console.error('[Spotify SDK] Failed to connect.')
        }
      })
    }

    // Global listener: unlocks autoplay via activateElement() on user gesture.
    const unlockAutoplay = () => {
      if (_sp.player && typeof _sp.player.activateElement === 'function') {
        _sp.player.activateElement()
          .then(() => console.log('[Spotify SDK] activateElement() SUCCESS (global)'))
          .catch(err => console.error('[Spotify SDK] activateElement() FAILED (global):', err))
        window.removeEventListener('click', unlockAutoplay, { capture: true })
        window.removeEventListener('touchend', unlockAutoplay, { capture: true })
        window.removeEventListener('keydown', unlockAutoplay, { capture: true })
      }
    }
    window.addEventListener('click', unlockAutoplay, { capture: true })
    window.addEventListener('touchend', unlockAutoplay, { capture: true })
    window.addEventListener('keydown', unlockAutoplay, { capture: true })

    // Pre-inject the SDK script globally
    if (!document.querySelector('script[src*="sdk.scdn.co/spotify-player"]')) {
      const s = document.createElement('script')
      s.src = 'https://sdk.scdn.co/spotify-player.js'
      s.async = true
      document.body.appendChild(s)
    }
  }

  return { initSpotifySDK }
}
