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

      <Dashboard
        v-else
        :favorites="favorites"
        @select="onSongSelect"
        @open-kanban="openKanban"
        @open-library="goToPage('library')"
        @toggle-settings="toggleModal('settings')"
      />
    </div>

    <!-- Chord Drawer (lyrics sub-panel, not in nav stack) -->
    <Transition
      @enter="onFooterEnter"
      @after-enter="onFooterAfterEnter"
      @leave="onFooterLeave"
      @after-leave="triggerLyricsResize"
      :css="false"
    >
      <ChordDrawer
        v-if="showChords && page === 'lyrics'"
        :loading="chordsLoading"
        :found="chordsFound"
        :sections="chordSections"
        :structure="chordStructure"
        :capo="chordCapo"
        :has-custom-chords="hasCustomChords"
        @update:chords="onChordsEdited"
        @reset-chords="onResetChords"
      />
    </Transition>

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
      @close="closeModal('randomizer')"
    />

    <KanbanView
      v-if="isModalOpen('kanban')"
      :favorites="favorites"
      @update="onKanbanUpdate"
      @close="onKanbanClose"
    />
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import LyricsDisplay from './components/LyricsDisplay.vue'
import LibraryOverlay from './components/LibraryOverlay.vue'
import TopBar from './components/TopBar.vue'
import SettingsDropdown from './components/SettingsDropdown.vue'
import ChordDrawer from './components/ChordDrawer.vue'
import SpotifyPlayer from './components/SpotifyPlayer.vue'
import SongRandomizer from './components/SongRandomizer.vue'
import KanbanView from './components/KanbanView.vue'
import Dashboard from './components/Dashboard.vue'

import { useFavorites } from './composables/useFavorites.js'
import { useSettings } from './composables/useSettings.js'
import { useChords } from './composables/useChords.js'
import { useUGImport } from './composables/useUGImport.js'
import { usePlaylistSync } from './composables/usePlaylistSync.js'
import { useKeyboard } from './composables/useKeyboard.js'
import { useNavigation } from './composables/useNavigation.js'
import { useSpotifyAuth } from './composables/useSpotifyAuth.js'

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

// --- Debounced label→playlist sync ---
let labelSyncTimer = null
let labelsDirty = false
let lastSyncAt = 0
const SYNC_COOLDOWN = 30000 // 30s

async function flushLabelSync() {
  clearTimeout(labelSyncTimer)
  if (!labelsDirty || !spotifyConnected.value) return
  labelsDirty = false
  try {
    await fetch('/api/spotify/playlists/sync', { method: 'POST' })
    lastSyncAt = Date.now()
    console.log('Label playlist sync complete')
  } catch (err) {
    console.warn('Label playlist sync failed:', err.message)
  }
}

function scheduleLabelSync() {
  if (!spotifyConnected.value) return
  labelsDirty = true
  clearTimeout(labelSyncTimer)
  labelSyncTimer = setTimeout(flushLabelSync, 5000)
}

function onSetLabel(label) {
  setLabel(label)
  scheduleLabelSync()
}

function onLibraryUpdated() {
  refreshCurrentSong()
  scheduleLabelSync()
}

async function openKanban() {
  pushModal('kanban')
  // Rate-limited pull from Spotify before showing the board
  if (spotifyConnected.value && Date.now() - lastSyncAt > SYNC_COOLDOWN) {
    try {
      await fetch('/api/spotify/playlists/sync', { method: 'POST' })
      lastSyncAt = Date.now()
      await loadFavorites()
    } catch {}
  }
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
  scheduleLabelSync()
}

function onKanbanClose() {
  closeModal('kanban')
  flushLabelSync()
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
        fetch(`/api/songs/${fav.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lyrics: editLyricsText.value }),
        })
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
  await fetch('/api/songs/bulk-update', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ field: 'played', value: false }),
  })
}

// --- Footer animation ---
const ANIM_DURATION = 300

function triggerLyricsResize() {
  window.dispatchEvent(new Event('resize'))
}

function onFooterEnter(el, done) {
  el.style.overflow = 'hidden'
  el.style.height = '0px'
  el.style.opacity = '0'
  void el.offsetHeight

  const targetHeight = el.scrollHeight
  const anim = el.animate(
    [
      { height: '0px', opacity: 0 },
      { height: targetHeight + 'px', opacity: 1 },
    ],
    { duration: ANIM_DURATION, easing: 'ease' }
  )
  anim.onfinish = () => {
    el.style.height = ''
    el.style.opacity = ''
    el.style.overflow = ''
    done()
  }
}

function onFooterAfterEnter() {
  triggerLyricsResize()
}

function onFooterLeave(el, done) {
  const currentHeight = el.offsetHeight
  el.style.overflow = 'hidden'

  const anim = el.animate(
    [
      { height: currentHeight + 'px', opacity: 1 },
      { height: '0px', opacity: 0 },
    ],
    { duration: ANIM_DURATION, easing: 'ease' }
  )
  anim.onfinish = () => {
    el.style.height = '0px'
    done()
  }
}

// --- Spotify player lifecycle ---
let focusInterval = null
watch(showPlayer, (val) => {
  setTimeout(triggerLyricsResize, 350)

  if (val) {
    focusInterval = setInterval(() => {
      if (document.activeElement?.tagName === 'IFRAME') {
        window.focus()
      }
    }, 1000)
  } else {
    // Pause playback via exposed method
    spotifyPlayerRef.value?.pause()
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

  syncPlaylist().then(() => {
    backfillAlbumArt()
  })

  // Auto-sync label playlists on startup (pull changes from Spotify)
  checkSpotifyStatus().then(() => {
    if (spotifyConnected.value) {
      fetch('/api/spotify/playlists/sync', { method: 'POST' })
        .then(() => loadFavorites())
        .catch(() => {})
    }
  })
})

onUnmounted(() => {
  clearInterval(focusInterval)
  stopUGImportPoll()
})
</script>
