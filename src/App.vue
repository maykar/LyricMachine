<template>
  <div class="app-root">
    <!-- Top bar: font controls, edit, settings, star, page indicator -->
    <TopBar
      :editing-lyrics="editingLyrics"
      :has-lyrics="!!currentLyrics"
      :has-title="!!currentTitle"
      :page="page"
      :is-saved="isSaved"
      :current-label="currentLabel"
      :current-played="currentPlayed"
      :current-play-count="currentPlayCount"
      :total-pages="lyricsRef?.totalPages || 1"
      :current-page="lyricsRef?.currentPage || 1"
      @adjust-font="(d) => lyricsRef?.adjustFont(d)"
      @reset-font="() => lyricsRef?.resetFont()"
      @save-edit="exitEditMode"
      @cancel-edit="cancelEditMode"
      @enter-edit="enterEditMode"
      @open-library="goToPage('library')"
      @toggle-settings="toggleModal('settings')"
      @toggle-star="toggleStar"
      @set-label="onSetLabel"
      @toggle-played="togglePlayed"
    />

    <!-- Settings modal -->
    <SettingsDropdown
      v-if="isModalOpen('settings')"
      :defaults="userDefaults"
      :apply-status="applyStatus"
      :reset-chord-status="resetChordStatus"
      :spotify-connected="spotifyConnected"
      :spotify-user="spotifyUser"
      @save-defaults="saveDefaults"
      @apply-defaults-to-all="handleApplyDefaultsToAll"
      @reset-all-chords="handleClearAllChords"
      @clear-played-status="clearAllPlayed"
      @connect-spotify="connectSpotify"
      @disconnect-spotify="onDisconnectSpotify"
      @trigger-sync="onSpotifySync"
      @close="closeModal('settings')"
    />

    <!-- Main content area: page-based rendering -->
    <div class="lyrics-container">
      <textarea
        v-if="editingLyrics && page === 'lyrics'"
        ref="editTextarea"
        v-model="editLyricsText"
        class="lyrics-editor"
        placeholder="Type or paste lyrics here…"
      ></textarea>

      <LyricsDisplay
        v-else-if="page === 'lyrics'"
        ref="lyricsRef"
        :lyrics="currentLyrics"
        :initial-adjust="fontAdjust"
        :initial-merge="songMerge"
        :initial-separators="songSeparators"
        :initial-alt-colors="songAltColors"
        :overlay-open="hasModal"
        @adjust-changed="onAdjustChanged"
        @merge-changed="onMergeChanged"
        @separators-changed="onSeparatorsChanged"
        @alt-colors-changed="onAltColorsChanged"
      />

      <LibraryOverlay
        v-else-if="page === 'library'"
        @select="onSongSelect"
        @close="goBack"
        @go-home="goHome"
        @updated="onLibraryUpdated"
        @defaults-changed="onDefaultsChanged"
        @toggle-settings="toggleModal('settings')"
        @open-randomizer="pushModal('randomizer')"
        @open-kanban="openKanban"
      />

      <!-- Dashboard stays permanently mounted so images don't re-download -->
      <Dashboard
        v-show="page === 'dashboard'"
        :favorites="favorites"
        @select="onSongSelect"
        @open-kanban="openKanban"
        @open-library="goToPage('library')"
        @toggle-settings="toggleModal('settings')"
        @updated="onLibraryUpdated"
      />
    </div>

    <!-- Chord Drawer (lyrics sub-panel, not in nav stack) -->
    <div class="chord-wrapper" :class="{ 'chord-wrapper--open': showChords && page === 'lyrics' }">
      <ChordDrawer
        v-if="page === 'lyrics'"
        :loading="chordsLoading"
        :found="chordsFound"
        :sections="chordSections"
        :structure="chordStructure"
        :capo="chordCapo"
        :has-custom-chords="hasCustomChords"
        @update:chords="onChordsEdited"
        @reset-chords="onResetChords"
      />
    </div>

    <!-- Spotify Player (lyrics sub-panel, not in nav stack) -->
    <SpotifyPlayer
      ref="spotifyPlayerRef"
      :visible="showPlayer && page === 'lyrics'"
      :spotify-track-id="spotifyTrackId"
    />

    <!-- Modals: float on top of any page -->
    <SongRandomizer
      v-if="isModalOpen('randomizer')"
      :favorites="favorites"
      @select="onRandomizerSelect"
      @updated="onLibraryUpdated"
      @close="closeModal('randomizer')"
    />

    <KanbanView
      v-if="isModalOpen('kanban')"
      :favorites="favorites"
      @update="onKanbanUpdate"
      @close="onKanbanClose"
    />

    <ToastContainer />
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted, onErrorCaptured, nextTick } from 'vue'
import LyricsDisplay from './components/LyricsDisplay.vue'
import LibraryOverlay from './components/LibraryOverlay.vue'
import TopBar from './components/TopBar.vue'
import SettingsDropdown from './components/SettingsDropdown.vue'
import ChordDrawer from './components/ChordDrawer.vue'
import SpotifyPlayer from './components/SpotifyPlayer.vue'
import SongRandomizer from './components/SongRandomizer.vue'
import KanbanView from './components/KanbanView.vue'
import Dashboard from './components/Dashboard.vue'
import ToastContainer from './components/ToastContainer.vue'

import { api } from './api.js'
import { useToast } from './composables/useToast.js'

import { useFavorites } from './composables/useFavorites.js'
import { useSettings } from './composables/useSettings.js'
import { useChords } from './composables/useChords.js'
import { useUGImport } from './composables/useUGImport.js'
import { usePlaylistSync } from './composables/usePlaylistSync.js'
import { useKeyboard } from './composables/useKeyboard.js'
import { useNavigation } from './composables/useNavigation.js'
import { useSpotifyAuth } from './composables/useSpotifyAuth.js'

// --- Error boundary ---
const { showToast } = useToast()
onErrorCaptured((err) => {
  console.error('Unhandled component error:', err)
  showToast(err.message || 'Something went wrong', { type: 'error' })
  return false  // prevent propagation
})

// --- Global Spotify SDK Setup ---
// Initialize once at the application root so the player is ready long
// before the user interacts with the Randomizer, ensuring activateElement()
// captures the very first top-level click to satisfy browser autoplay.
const _sp = window.__spotify || (window.__spotify = { player: null, deviceId: null, ready: false })

if (!_sp._init) {
  _sp._init = true
  window.onSpotifyWebPlaybackSDKReady = () => {
    const player = new window.Spotify.Player({
      name: 'LyricMachine Web Player',
      getOAuthToken: cb => {
        // Fetch a fresh token every time the SDK needs one (server auto-refreshes)
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
        // Inspect actual state
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
        // Also watch for iframes created later
        const obs = new MutationObserver(patchIframes)
        obs.observe(document.body, { childList: true, subtree: true })
      } else {
        console.error('[Spotify SDK] Failed to connect.')
      }
    })
  }

  // Global listener: unlocks autoplay via activateElement() on user gesture.
  // Keeps listening until the player is ready AND the user interacts.
  const unlockAutoplay = () => {
    console.log('[Spotify SDK] unlockAutoplay fired, player?', !!_sp.player, 'activateElement?', typeof _sp.player?.activateElement)
    if (_sp.player && typeof _sp.player.activateElement === 'function') {
      _sp.player.activateElement()
        .then(() => console.log('[Spotify SDK] activateElement() SUCCESS (global)'))
        .catch(err => console.error('[Spotify SDK] activateElement() FAILED (global):', err))
      // Remove listeners only after successful activation
      window.removeEventListener('click', unlockAutoplay, { capture: true })
      window.removeEventListener('touchend', unlockAutoplay, { capture: true })
      window.removeEventListener('keydown', unlockAutoplay, { capture: true })
    }
  }
  window.addEventListener('click', unlockAutoplay, { capture: true })
  window.addEventListener('touchend', unlockAutoplay, { capture: true })
  window.addEventListener('keydown', unlockAutoplay, { capture: true })

  // Pre-inject the SDK script globally if it isn't already
  if (!document.querySelector('script[src*="sdk.scdn.co/spotify-player"]')) {
    const s = document.createElement('script')
    s.src = 'https://sdk.scdn.co/spotify-player.js'
    s.async = true
    document.body.appendChild(s)
  }
}


// --- Composables ---
const {
  currentTitle, currentLyrics, fontAdjust,
  songMerge, songSeparators, songAltColors, isSaved, currentLabel, currentPlayed, currentPlayCount,
  favorites, getFavorites, loadFavorites,
  refreshSavedState, refreshCurrentSong, toggleStar, setLabel, togglePlayed,
  onAdjustChanged, onMergeChanged, onSeparatorsChanged, onAltColorsChanged,
} = useFavorites()

const {
  userDefaults, applyStatus,
  resetChordStatus,
  loadUserDefaults, saveDefaults, onDefaultsChanged,
  applyDefaultsToAll, clearAllChords,
} = useSettings()

const {
  showChords, chordsLoading, chordsFound,
  chordSections, chordStructure, chordCapo,
  spotifyTrackId, showPlayer, hasCustomChords,
  fetchChords, onChordsEdited, onResetChords,
} = useChords(favorites, currentTitle, isSaved)

const { startUGImportPoll, stopUGImportPoll } = useUGImport(
  favorites, currentTitle,
  { chordSections, chordStructure, chordsFound, showChords }
)

const { syncPlaylist, backfillAlbumArt } = usePlaylistSync(favorites, userDefaults)

const {
  spotifyConnected, spotifyUser,
  checkSpotifyStatus, connectSpotify, disconnectSpotify,
} = useSpotifyAuth()

async function onDisconnectSpotify() {
  await disconnectSpotify()
}

async function onSpotifySync() {
  // Reload favorites after sync since server may have added/modified songs
  await loadFavorites()
}

function onSetLabel(label) {
  setLabel(label)
}

function onLibraryUpdated() {
  refreshCurrentSong()
}

function openKanban() {
  pushModal('kanban')
}

// --- UI state (unified navigation) ---
const {
  page, goToPage, goBack,
  hasModal, pushModal, closeModal, popModal, isModalOpen,
  dismissTop,
} = useNavigation()

function toggleModal(name) {
  if (isModalOpen(name)) closeModal(name)
  else pushModal(name)
}

const lyricsRef = ref(null)
const spotifyPlayerRef = ref(null)
const editingLyrics = ref(false)
const editLyricsText = ref('')
const editTextarea = ref(null)

function goHome() {
  goToPage('dashboard')
  currentTitle.value = ''
  currentLyrics.value = ''
  showChords.value = false
  showPlayer.value = false
}

function onKanbanUpdate(updatedFavs) {
  favorites.value = updatedFavs
}

function onKanbanClose() {
  closeModal('kanban')
}

function onRandomizerSelect(fav) {
  closeModal('randomizer')
  onSongSelect(fav)
}

// --- Keyboard shortcuts ---
useKeyboard({
  editingLyrics,
  cancelEditMode,
  page,
  hasModal,
  dismissTop,
  goToPage,
  pushModal,
  showChords,
  showPlayer,
  currentTitle,
  currentLyrics,
  startUGImportPoll,
})

// --- Song selection ---

function onSongSelect({ title, lyrics, fontAdjust: fa, merge, separators, altColors }) {
  currentTitle.value = title
  currentLyrics.value = lyrics
  fontAdjust.value = fa || 0
  songMerge.value = merge !== undefined ? merge : userDefaults.value.merge
  songSeparators.value = separators !== undefined ? separators : userDefaults.value.separators
  songAltColors.value = altColors !== undefined ? altColors : userDefaults.value.altColors
  goToPage('lyrics')
  refreshCurrentSong()
  fetchChords(title)
}

// --- Edit mode ---
function enterEditMode() {
  editLyricsText.value = currentLyrics.value || ''
  editingLyrics.value = true
  nextTick(() => editTextarea.value?.focus())
}

function exitEditMode() {
  currentLyrics.value = editLyricsText.value
  editingLyrics.value = false

  if (isSaved.value && currentTitle.value) {
    const fav = favorites.value.find(f => f.title === currentTitle.value)
    if (fav) {
      fav.lyrics = editLyricsText.value
      if (fav.id) {
        api.updateSong(fav.id, { lyrics: editLyricsText.value })
      }
    }
  }
}

function cancelEditMode() {
  editingLyrics.value = false
}

// --- Settings wrappers ---
function handleApplyDefaultsToAll() {
  applyDefaultsToAll(favorites)
}

function handleClearAllChords() {
  clearAllChords(favorites, fetchChords, currentTitle)
}

async function clearAllPlayed() {
  for (const fav of favorites.value) {
    fav.played = false
  }
  await api.bulkUpdate('played', false)
}



// Spotify player lifecycle
let focusInterval = null
watch(showPlayer, (val) => {
  if (val) {
    focusInterval = setInterval(() => {
      if (document.activeElement?.tagName === 'IFRAME') {
        window.focus()
      }
    }, 1000)
  } else {
    // Only send toggle (pause) if user actually started playback.
    // The embed's 'toggle' command starts music if nothing is playing,
    // so we guard it behind the interacted flag.
    spotifyPlayerRef.value?.pauseIfPlaying()
    clearInterval(focusInterval)
    focusInterval = null
  }
})

// --- Stop Spotify when leaving lyrics page ---
watch(page, (newPage, oldPage) => {
  if (oldPage === 'lyrics' && newPage !== 'lyrics') {
    showPlayer.value = false
    spotifyTrackId.value = null  // destroy iframe fully
  }
})

// --- Lifecycle ---
onMounted(async () => {
  await loadFavorites()
  loadUserDefaults()

  // Check Spotify connection first to decide sync strategy
  await checkSpotifyStatus()

  if (spotifyConnected.value) {
    // Server-side sync handles source playlist + not-in-playlist tracking
    try {
      await api.syncSpotify()
      await loadFavorites()
    } catch {}
  } else {
    // Fall back to client-side sync (uses client credentials, no user auth needed)
    await syncPlaylist()
  }

  backfillAlbumArt()
})

onUnmounted(() => {
  clearInterval(focusInterval)
  stopUGImportPoll()
})
</script>

<style>
.app-root {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

.lyrics-container {
  flex: 1;
  min-height: 30vh;
  overflow: hidden;
  position: relative;
}

.chord-wrapper {
  flex-shrink: 0;
  overflow: hidden;
  max-height: 0;
  transition: max-height 0.3s ease;
}

.chord-wrapper--open {
  max-height: 35vh;
}

.lyrics-editor {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  height: 100%;
  background: var(--bg-app);
  color: var(--text-primary);
  border: none;
  padding: 1.5rem 2rem;
  font-family: 'Inter', sans-serif;
  font-size: 0.95rem;
  line-height: 1.7;
  resize: none;
  outline: none;
  overflow-y: auto;
  box-sizing: border-box;
}

.lyrics-editor::placeholder {
  color: rgba(255, 255, 255, 0.2);
}
</style>
