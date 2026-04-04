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
      @clear-played-status="clearPlayedStatus"
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
        :transpose="chordTranspose"
        @update:chords="onChordsEdited"
        @reset-chords="onResetChords"
        @change-transpose="onTransposeChords"
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
import { useCustomLabelsStore } from './stores/customLabels.js'

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
import { useSpotifySDK } from './composables/useSpotifySDK.js'

// --- Error boundary ---
const { showToast, updateToast, dismissToast } = useToast()
const customLabelsStore = useCustomLabelsStore()

onErrorCaptured((err) => {
  console.error('Unhandled component error:', err)
  showToast(err.message || 'Something went wrong', { type: 'error' })
  return false  // prevent propagation
})

// --- Global Spotify SDK Setup ---
const { initSpotifySDK } = useSpotifySDK()


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
  chordSections, chordStructure, chordCapo, chordTranspose,
  spotifyTrackId, showPlayer, hasCustomChords,
  fetchChords, onChordsEdited, onResetChords, onTransposeChords,
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

async function onSongSelect(fav) {
  const { title, fontAdjust: fa, merge, separators, altColors } = fav
  currentTitle.value = title
  
  if ((fav.hasLyrics || fav.hasChords) && typeof fav.lyrics === 'undefined') {
    const fullSong = await api.getSong(fav.id)
    if (fullSong) {
      fav.lyrics = fullSong.lyrics
      fav.customChords = fullSong.customChords
    }
  }
  
  currentLyrics.value = fav.lyrics || ''
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

async function clearPlayedStatus() {
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
  customLabelsStore.load()

  // Check Spotify connection first to decide sync strategy
  await checkSpotifyStatus()

  if (spotifyConnected.value) {
    // Server-side sync handles source playlist + not-in-playlist tracking
    const toastId = showToast('Syncing Spotify...', { type: 'info', duration: 0 })
    try {
      const result = await api.syncSpotify()
      await loadFavorites()
      
      const added = result?.added || 0
      if (added > 0) {
        updateToast(toastId, `Sync complete. Added ${added} tracks.`, 'success')
      } else {
        updateToast(toastId, 'Sync complete. No new tracks.', 'info')
      }
      setTimeout(() => dismissToast(toastId), 3000)
    } catch {
      updateToast(toastId, 'Spotify sync failed', 'error')
      setTimeout(() => dismissToast(toastId), 3000)
    }
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
