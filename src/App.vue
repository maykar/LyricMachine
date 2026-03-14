<template>
  <div class="app-root">
    <!-- Top bar: font controls, edit, settings, star, page indicator -->
    <TopBar
      :editing-lyrics="editingLyrics"
      :has-lyrics="!!currentLyrics"
      :has-title="!!currentTitle"
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
      @open-library="showLibrary = true"
      @toggle-settings="showSettings = !showSettings"
      @toggle-star="toggleStar"
      @set-label="setLabel"
      @toggle-played="togglePlayed"
    />

    <!-- Settings dropdown -->
    <SettingsDropdown
      v-if="showSettings"
      :defaults="userDefaults"
      :apply-status="applyStatus"
      :reset-chord-status="resetChordStatus"
      @save-defaults="saveDefaults"
      @apply-defaults-to-all="handleApplyDefaultsToAll"
      @reset-all-chords="handleClearAllChords"
      @clear-played-status="clearAllPlayed"
      @close="showSettings = false"
    />

    <!-- Main lyrics display -->
    <div class="lyrics-container">
      <textarea
        v-if="editingLyrics"
        ref="editTextarea"
        v-model="editLyricsText"
        class="lyrics-editor"
        placeholder="Type or paste lyrics here…"
      ></textarea>

      <LyricsDisplay
        v-else-if="currentLyrics"
        ref="lyricsRef"
        :lyrics="currentLyrics"
        :initial-adjust="fontAdjust"
        :initial-merge="songMerge"
        :initial-separators="songSeparators"
        :initial-alt-colors="songAltColors"
        @adjust-changed="onAdjustChanged"
        @merge-changed="onMergeChanged"
        @separators-changed="onSeparatorsChanged"
        @alt-colors-changed="onAltColorsChanged"
      />

      <div v-else class="empty-state">
        <img src="/SloshRat.png" alt="Slosh Rat" class="slosh-rat" /><br><br><br>
        <div class="hint">Press Space to search</div>
      </div>
    </div>

    <!-- Chord Drawer -->
    <Transition
      @enter="onFooterEnter"
      @after-enter="onFooterAfterEnter"
      @leave="onFooterLeave"
      @after-leave="triggerLyricsResize"
      :css="false"
    >
      <ChordDrawer
        v-if="showChords"
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

    <!-- Spotify Player -->
    <SpotifyPlayer
      :visible="showPlayer"
      :spotify-track-id="spotifyTrackId"
    />

    <!-- Library Overlay -->
    <LibraryOverlay
      v-if="showLibrary"
      @select="onSongSelect"
      @close="showLibrary = false"
      @updated="refreshCurrentSong"
      @defaults-changed="onDefaultsChanged"
      @toggle-settings="showSettings = !showSettings"
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

import { useFavorites } from './composables/useFavorites.js'
import { useSettings } from './composables/useSettings.js'
import { useChords } from './composables/useChords.js'
import { useUGImport } from './composables/useUGImport.js'
import { usePlaylistSync } from './composables/usePlaylistSync.js'
import { useKeyboard } from './composables/useKeyboard.js'

// --- Composables ---
const {
  currentTitle, currentLyrics, fontAdjust,
  songMerge, songSeparators, songAltColors, isSaved, currentLabel, currentPlayed, currentPlayCount,
  getFavorites, saveFavoritesArray,
  refreshSavedState, refreshCurrentSong, toggleStar, setLabel, togglePlayed,
  onAdjustChanged, onMergeChanged, onSeparatorsChanged, onAltColorsChanged,
} = useFavorites()

const {
  userDefaults, showSettings, applyStatus,
  resetChordStatus,
  loadUserDefaults, saveDefaults, onDefaultsChanged,
  applyDefaultsToAll, clearAllChords,
} = useSettings()

const {
  showChords, chordsLoading, chordsFound,
  chordSections, chordStructure, chordCapo,
  spotifyTrackId, showPlayer, hasCustomChords,
  fetchChords, onChordsEdited, onResetChords,
} = useChords(getFavorites, saveFavoritesArray, currentTitle, isSaved)

const { startUGImportPoll, stopUGImportPoll } = useUGImport(
  getFavorites, saveFavoritesArray, currentTitle,
  { chordSections, chordStructure, chordsFound, showChords }
)

const { syncPlaylist, backfillAlbumArt } = usePlaylistSync(getFavorites, saveFavoritesArray, userDefaults)

// --- UI state ---
const showLibrary = ref(false)
const lyricsRef = ref(null)
const editingLyrics = ref(false)
const editLyricsText = ref('')
const editTextarea = ref(null)

// --- Keyboard shortcuts ---
useKeyboard({
  editingLyrics,
  cancelEditMode,
  showLibrary,
  currentTitle,
  currentLyrics,
  showChords,
  showPlayer,
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
  showLibrary.value = false
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
    const favs = getFavorites()
    const fav = favs.find(f => f.title === currentTitle.value)
    if (fav) {
      fav.lyrics = editLyricsText.value
      saveFavoritesArray(favs)
    }
  }
}

function cancelEditMode() {
  editingLyrics.value = false
}

// --- Settings wrappers ---
function handleApplyDefaultsToAll() {
  applyDefaultsToAll(getFavorites, saveFavoritesArray)
}

function handleClearAllChords() {
  clearAllChords(getFavorites, saveFavoritesArray, fetchChords, currentTitle)
}

function clearAllPlayed() {
  const favs = getFavorites()
  for (const fav of favs) {
    fav.played = false
  }
  saveFavoritesArray(favs)
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
    // Pause playback via postMessage (iframe stays alive)
    const iframe = document.querySelector('.spotify-embed iframe')
    if (iframe) iframe.contentWindow?.postMessage({ command: 'toggle' }, '*')
    clearInterval(focusInterval)
    focusInterval = null
  }
})

// --- Stop Spotify when leaving lyric page ---
watch(showLibrary, (val) => {
  if (val) {
    showPlayer.value = false
    spotifyTrackId.value = null  // destroy iframe fully
  }
})

// --- Lifecycle ---
onMounted(() => {
  loadUserDefaults()
  syncPlaylist().then(() => backfillAlbumArt())
})

onUnmounted(() => {
  clearInterval(focusInterval)
  stopUGImportPoll()
})
</script>
