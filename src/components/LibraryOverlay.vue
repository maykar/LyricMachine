<template>
  <div class="overlay-backdrop library-overlay" @mousedown.self="backdropMouseDown = true" @mouseup.self="onBackdropUp">
    <div class="library-panel">
      <!-- Search bar -->
      <div class="library-search">
        <input
          ref="inputRef"
          v-model="query"
          class="library-input"
          type="text"
          placeholder="Search for a song…"
          @keydown.escape="$emit('close')"
        />
        <span v-if="!query.trim()" class="library-actions">
          <button class="action-btn" @click="toggleDropdown('newSong')" title="New Song"><MdiIcon :path="mdiPlus" :size="32" /></button>
          <button v-if="favorites.length" class="action-btn" @click="exportFavorites" title="Export"><MdiIcon :path="mdiDownload" :size="32" /></button>
          <button class="action-btn" @click="triggerImport" title="Import"><MdiIcon :path="mdiUpload" :size="32" /></button>
          <div v-if="favorites.length" class="filter-wrapper">
            <button
              class="action-btn"
              :class="{ active: activeFilterCount > 0 }"
              title="Filters"
              @click.stop="toggleDropdown('filter')"
            >
              <MdiIcon :path="mdiFilterVariant" :size="32" />
              <span v-if="activeFilterCount" class="filter-badge">{{ activeFilterCount }}</span>
            </button>
            <div v-if="showFilterDropdown" class="filter-dropdown" @click.stop>
              <label class="filter-item">
                <input type="checkbox" v-model="hidePlayed" />
                <span>Unplayed</span>
              </label>
              <label class="filter-item">
                <input type="checkbox" v-model="filterNoChords" />
                <span>No Chords</span>
              </label>
              <div class="filter-divider"></div>
              <label class="filter-item">
                <input type="checkbox" v-model="filterFresh" />
                <span class="filter-label-dot" style="--lc:#e74c3c">Fresh</span>
              </label>
              <label class="filter-item">
                <input type="checkbox" v-model="filterGettingThere" />
                <span class="filter-label-dot" style="--lc:#f1c40f">Getting There</span>
              </label>
              <label class="filter-item">
                <input type="checkbox" v-model="filterInSetlist" />
                <span class="filter-label-dot" style="--lc:#2ecc71">In Setlist</span>
              </label>
              <div class="filter-divider"></div>
              <label class="filter-item">
                <input type="checkbox" v-model="filterNotInPlaylist" />
                <span>Not in playlist</span>
              </label>
            </div>
          </div>
          <div v-if="favorites.length" class="filter-wrapper">
            <button
              class="action-btn"
              :class="{ active: sortBy !== 'none' }"
              title="Sort"
              @click.stop="toggleDropdown('sort')"
            >
              <MdiIcon :path="mdiSort" :size="32" />
            </button>
            <div v-if="showSortDropdown" class="filter-dropdown" @click.stop>
              <button class="filter-item filter-btn" :class="{ active: sortBy === 'alpha' }" @click="toggleSort('alpha')">
                <span>Alphabetical</span>
                <span v-if="sortBy === 'alpha'" class="sort-arrow">{{ sortDir === 'asc' ? '↑' : '↓' }}</span>
              </button>
              <button class="filter-item filter-btn" :class="{ active: sortBy === 'label' }" @click="toggleSort('label')">
                <span>Label</span>
                <span v-if="sortBy === 'label'" class="sort-arrow">{{ sortDir === 'asc' ? '↑' : '↓' }}</span>
              </button>
              <button class="filter-item filter-btn" :class="{ active: sortBy === 'playCount' }" @click="toggleSort('playCount')">
                <span>Play Count</span>
                <span v-if="sortBy === 'playCount'" class="sort-arrow">{{ sortDir === 'asc' ? '↑' : '↓' }}</span>
              </button>
            </div>
          </div>
          <button v-if="favorites.some(f => f.played > 0)" class="action-btn" @click="resetAllPlayed" title="Clear all played"><MdiIcon :path="mdiRefresh" :size="32" /></button>
          <button v-if="favorites.length" class="action-btn" @click="$emit('open-kanban')" title="Kanban View"><MdiIcon :path="mdiViewColumn" :size="32" /></button>
          <button v-if="favorites.length >= 2" class="action-btn" @click="$emit('open-randomizer')" title="Randomize"><MdiIcon :path="mdiDice5" :size="32" /></button>
          <button class="action-btn" @click="$emit('toggle-settings')" title="Settings"><MdiIcon :path="mdiCog" :size="32" /></button>
          <button class="action-btn" @click="$emit('go-home')" title="Dashboard"><MdiIcon :path="mdiHome" :size="32" /></button>
        </span>
      </div>

      <!-- Search results (when typing) -->
      <div v-if="query.trim() && searchResults.length" class="library-results">
        <div class="library-section-label">Search Results</div>
        <div
          class="library-grid favorites-grid"
          :style="{ gridTemplateRows: 'repeat(' + rowsPerPage + ', auto)' }"
        >
          <div
            v-for="(result, i) in searchResults"
            :key="'s-' + i"
            class="library-item"
            @click="selectResult(result)"
          >
            <div class="library-item-info">
              <span class="library-item-artist">{{ result.artistName }}</span>
              <span class="library-item-track">{{ result.trackName }}</span>
            </div>
            <button
              class="star-btn-inline"
              :class="{ saved: isFavorited(result) }"
              title="Toggle favorite"
              @click.stop="toggleFavoriteResult(result)"
            >{{ isFavorited(result) ? '★' : '☆' }}</button>
          </div>
        </div>
        <div v-if="searching" class="library-status">Searching…</div>
      </div>

      <!-- Searching, no results yet -->
      <div v-else-if="query.trim() && searching" class="library-status-center">
        Searching…
      </div>

      <!-- Searched but nothing found -->
      <div v-else-if="query.trim() && searched && !searchResults.length" class="library-status-center">
        No lyrics found — try a different search
      </div>

      <!-- Favorites (when NOT searching) -->
      <div v-if="!query.trim()" class="library-favorites" ref="favContainerRef">


        <!-- New Song form -->
        <NewSongForm :visible="showNewSong" @created="onNewSong" />
        <div
          v-if="favorites.length"
          class="library-grid favorites-grid"
          :style="{ gridTemplateRows: 'repeat(' + rowsPerPage + ', auto)' }"
        >
          <div
            v-for="entry in pagedFavorites"
            :key="'f-' + entry.fav.title"
            class="library-item"
            :class="{ 'drag-over': dragOverIndex === entry.realIndex, 'is-played': !!entry.fav.played }"
            draggable="true"
            @click="$emit('select', entry.fav)"
            @contextmenu="onContextMenu($event, entry.realIndex)"
            @dragstart="onDragStart(entry.realIndex, $event)"
            @dragover.prevent="onDragOver(entry.realIndex)"
            @dragleave="dragOverIndex = -1"
            @drop.prevent="onDrop(entry.realIndex)"
            @dragend="onDragEnd"
          >
            <span class="card-top-right">
              <button
                class="played-check"
                :class="{ checked: !!entry.fav.played }"
                title="Played"
                @click.stop="incrementPlayed(entry.realIndex)"
              >{{ entry.fav.played ? '✓' : '' }}</button>
              <span
                v-if="entry.fav.notInPlaylist"
                class="not-in-playlist-icon"
                title="Not in source playlist"
              >
                <MdiIcon :path="mdiPlaylistRemove" :size="16" />
              </span>
              <span class="label-dot-indicator" :style="{ background: labelColor(entry.fav.label) }" :title="labelName(entry.fav.label)"></span>
            </span>
            <div class="library-item-info">
              <span class="library-item-artist">{{ truncate(splitTitle(entry.fav.title).artist, 50) }}</span>
              <span class="library-item-track">{{ truncate(splitTitle(entry.fav.title).track, 45) }}</span>
            </div>
            <div class="library-item-actions">
              <span v-if="entry.fav.playCount" class="play-count">{{ entry.fav.playCount }}</span>
            </div>
          </div>
        </div>
        <div v-if="favorites.length && favTotalPages > 1" class="library-page-nav">
          <button class="page-btn" :disabled="favPage <= 1" @click="favPage--"><MdiIcon :path="mdiChevronLeft" :size="18" /></button>
          <span class="page-info">{{ favPage }} / {{ favTotalPages }}</span>
          <button class="page-btn" :disabled="favPage >= favTotalPages" @click="favPage++"><MdiIcon :path="mdiChevronRight" :size="18" /></button>
        </div>
        <div v-if="!favorites.length" class="library-status-center">
          No saved favorites yet.<br />Star a song to save it here.
        </div>
      </div>

      <input
        ref="fileInput"
        type="file"
        accept=".json"
        style="display: none"
        @change="importFavorites"
      />





      <!-- Context menu -->
      <ContextMenu
        :show="ctxMenu.show"
        :x="ctxMenu.x"
        :y="ctxMenu.y"
        :fav="ctxMenu.fav"
        @set-label="setLabelFromCtx"
        @toggle-played="incrementPlayedFromCtx"
        @edit-count="editPlayCountFromCtx"
        @clear-count="clearPlayCountFromCtx"
        @delete="deleteFromCtx"
        @add-to-source="addToSourcePlaylist"
        @close="closeContextMenu"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, nextTick } from 'vue'
import { useEventListener, useDebounceFn } from '@vueuse/core'
import MdiIcon from './MdiIcon.vue'
import ContextMenu from './ContextMenu.vue'
import NewSongForm from './NewSongForm.vue'
import {
  mdiPlus, mdiDownload, mdiUpload, mdiFilterVariant, mdiRefresh,
  mdiViewColumn, mdiDice5, mdiCog, mdiChevronLeft, mdiChevronRight,
  mdiSort, mdiHome, mdiPlaylistRemove,
} from '@mdi/js'

import { useFavorites } from '../composables/useFavorites.js'
import { splitTitle } from '../utils/titleParser.js'
import { LABEL_OPTIONS } from '../constants/labels.js'
import { api } from '../api.js'

// Storage keys removed — all persistence via server API
const { favorites } = useFavorites()
const labelOptions = LABEL_OPTIONS

const emit = defineEmits(['close', 'go-home', 'select', 'updated', 'defaults-changed', 'toggle-settings', 'open-randomizer', 'open-kanban'])

const query = ref('')
const inputRef = ref(null)
const favContainerRef = ref(null)
const backdropMouseDown = ref(false)
const showNewSong = ref(false)
const hidePlayed = ref(false)
const filterNoChords = ref(false)
const filterFresh = ref(false)
const filterGettingThere = ref(false)
const filterInSetlist = ref(false)
const filterNotInPlaylist = ref(false)
const showFilterDropdown = ref(false)
const sortBy = ref('none')
const sortDir = ref('asc')
const showSortDropdown = ref(false)

function toggleDropdown(which) {
  if (which !== 'filter') showFilterDropdown.value = false
  if (which !== 'sort') showSortDropdown.value = false
  if (which !== 'newSong') showNewSong.value = false
  if (which === 'filter') showFilterDropdown.value = !showFilterDropdown.value
  else if (which === 'sort') showSortDropdown.value = !showSortDropdown.value
  else if (which === 'newSong') showNewSong.value = !showNewSong.value
}

function toggleSort(field) {
  if (sortBy.value === field) {
    if (sortDir.value === 'asc') {
      sortDir.value = 'desc'
    } else {
      sortBy.value = 'none'
      sortDir.value = 'asc'
    }
  } else {
    sortBy.value = field
    sortDir.value = 'asc'
  }
}



function labelColor(label) {
  const opt = labelOptions.find(o => o.value === label)
  return opt ? opt.color : 'transparent'
}

function labelName(label) {
  const opt = labelOptions.find(o => o.value === label)
  return opt ? opt.name : ''
}

const ctxMenu = reactive({ show: false, x: 0, y: 0, index: -1, fav: null })

function onContextMenu(e, index) {
  if (e.ctrlKey) return // let browser handle ctrl+right-click
  e.preventDefault()
  openContextMenu(e, index)
}

function openContextMenu(e, index) {
  ctxMenu.x = e.clientX
  ctxMenu.y = e.clientY
  ctxMenu.index = index
  ctxMenu.fav = favorites.value[index]
  ctxMenu.show = true
}

function closeContextMenu() { ctxMenu.show = false }

function setLabelFromCtx(label) {
  if (ctxMenu.index >= 0) {
    const fav = favorites.value[ctxMenu.index]
    fav.label = label
    if (fav.id) {
      api.updateSong(fav.id, { label })
    }
    emit('updated')
  }
  ctxMenu.show = false
}

function deleteFromCtx() {
  ctxMenu.show = false
  if (ctxMenu.index >= 0 && ctxMenu.fav) {
    const { artist, track } = splitTitle(ctxMenu.fav.title)
    const name = track || ctxMenu.fav.title
    if (confirm(`Remove "${name}" from favorites?`)) {
      removeFavorite(ctxMenu.index)
    }
  }
}

async function addToSourcePlaylist() {
  const fav = ctxMenu.fav
  ctxMenu.show = false
  if (!fav?.spotifyTrackId) return

  try {
    const data = await api.addToSourcePlaylist(fav.spotifyTrackId)
    if (data?.ok) {
      fav.notInPlaylist = false
      if (fav.id) {
        api.updateSong(fav.id, { notInPlaylist: false })
      }
      emit('updated')
    }
  } catch (err) {
    console.warn('Failed to add to source playlist:', err.message)
  }
}

function incrementPlayedFromCtx() {
  if (ctxMenu.index >= 0) {
    const fav = favorites.value[ctxMenu.index]
    fav.played = !fav.played
    if (fav.played) {
      fav.playCount = (fav.playCount || 0) + 1
    }
    if (fav.id) {
      fetch(`/api/songs/${fav.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ played: fav.played, playCount: fav.playCount }),
      })
    }
    emit('updated')
  }
  ctxMenu.show = false
}

function editPlayCountFromCtx() {
  ctxMenu.show = false
  if (ctxMenu.index >= 0 && ctxMenu.fav) {
    const current = ctxMenu.fav.playCount || 0
    const input = prompt('Set play count:', String(current))
    if (input !== null) {
      const num = parseInt(input, 10)
      if (!isNaN(num) && num >= 0) {
        const fav = favorites.value[ctxMenu.index]
        fav.playCount = num
        if (fav.id) {
          fetch(`/api/songs/${fav.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ playCount: num }),
          })
        }
        emit('updated')
      }
    }
  }
}

function clearPlayCountFromCtx() {
  if (ctxMenu.index >= 0) {
    const fav = favorites.value[ctxMenu.index]
    fav.playCount = 0
    fav.played = false
    if (fav.id) {
      fetch(`/api/songs/${fav.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playCount: 0, played: false }),
      })
    }
    emit('updated')
  }
  closeContextMenu()
}



const activeFilterCount = computed(() => {
  let count = 0
  if (hidePlayed.value) count++
  if (filterNoChords.value) count++
  if (filterFresh.value) count++
  if (filterGettingThere.value) count++
  if (filterInSetlist.value) count++
  if (filterNotInPlaylist.value) count++
  return count
})

function closeFilterDropdown(e) {
  if (showFilterDropdown.value) showFilterDropdown.value = false
  if (showSortDropdown.value) showSortDropdown.value = false
}

// Local Escape: close ephemeral UI (dropdowns, context menu) before global handler fires
useEventListener(window, 'keydown', (e) => {
  if (e.key !== 'Escape') return
  if (ctxMenu.show) {
    e.stopImmediatePropagation()
    closeContextMenu()
    return
  }
  if (showFilterDropdown.value || showSortDropdown.value || showNewSong.value) {
    e.stopImmediatePropagation()
    showFilterDropdown.value = false
    showSortDropdown.value = false
    showNewSong.value = false
    return
  }
}, { capture: true })

watch(hidePlayed, v => {
  api.setFilters({ hidePlayed: v, noChords: filterNoChords.value })
})
watch(filterNoChords, v => {
  api.setFilters({ hidePlayed: hidePlayed.value, noChords: v })
})
async function onNewSong({ title, lyrics }) {
  // Add to favorites via API
  const existing = favorites.value.findIndex(f => f.title === title)
  if (existing < 0) {
    const created = await api.createSong({ title, lyrics })
    if (created) {
      favorites.value.unshift(created)
      emit('updated')
    }
  }
  emit('select', { title, lyrics })
  showNewSong.value = false
}

function onBackdropUp() {
  if (backdropMouseDown.value) emit('close')
  backdropMouseDown.value = false
}


function truncate(str, chars) {
  if (!str || str.length <= chars) return str
  for (let i = chars; i > 0; i--) {
    if (str[i] === ' ' && /[a-zA-Z0-9]/.test(str[i - 1])) {
      return str.substring(0, i) + '…'
    }
  }
  return str.substring(0, chars) + '…'
}
const fileInput = ref(null)
const searchResults = ref([])
const searching = ref(false)
const searched = ref(false)
const favPage = ref(1)
const rowsPerPage = ref(5)

const COLS = 4
const CARD_HEIGHT = 64  // approx card height + gap in px

const unplayedFavorites = computed(() => favorites.value.filter(f => !f.played))

const displayedFavorites = computed(() => {
  let list = favorites.value
  if (hidePlayed.value) list = list.filter(f => !f.played)
  if (filterNoChords.value) list = list.filter(f => !f.customChords || f.customChords.length === 0)
  if (filterNotInPlaylist.value) list = list.filter(f => !!f.notInPlaylist)
  const anyLabel = filterFresh.value || filterGettingThere.value || filterInSetlist.value
  if (anyLabel) {
    list = list.filter(f => {
      const lbl = f.label || 'fresh'
      if (filterFresh.value && lbl === 'fresh') return true
      if (filterGettingThere.value && lbl === 'getting-there') return true
      if (filterInSetlist.value && lbl === 'in-setlist') return true
      return false
    })
  }
  if (sortBy.value !== 'none') {
    const labelOrder = { 'fresh': 0, 'getting-there': 1, 'in-setlist': 2 }
    list = [...list].sort((a, b) => {
      let cmp = 0
      if (sortBy.value === 'alpha') {
        cmp = (a.title || '').localeCompare(b.title || '')
      } else if (sortBy.value === 'label') {
        cmp = (labelOrder[a.label] || 0) - (labelOrder[b.label] || 0)
      } else if (sortBy.value === 'playCount') {
        cmp = (a.playCount || 0) - (b.playCount || 0)
      }
      return sortDir.value === 'asc' ? cmp : -cmp
    })
  }
  return list
})

const perPage = computed(() => rowsPerPage.value * COLS)
const favTotalPages = computed(() => Math.max(1, Math.ceil(displayedFavorites.value.length / perPage.value)))

const pagedFavorites = computed(() => {
  const start = (favPage.value - 1) * perPage.value
  // Build index map once per computation for O(1) lookup
  const indexMap = new Map(favorites.value.map((f, i) => [f, i]))
  return displayedFavorites.value
    .slice(start, start + perPage.value)
    .map((fav, i) => {
      const realIndex = indexMap.get(fav) ?? -1
      return { fav, realIndex }
    })
})

let searchTimer = null
const dragIndex = ref(-1)
const dragOverIndex = ref(-1)
const confirmDeleteIndex = ref(-1)
let confirmTimer = null

function onDragStart(index, e) {
  dragIndex.value = index
  e.dataTransfer.effectAllowed = 'move'
}

function onDragOver(index) {
  dragOverIndex.value = index
}

function onDrop(toIndex) {
  const fromIndex = dragIndex.value
  if (fromIndex < 0 || fromIndex === toIndex) return

  const item = favorites.value.splice(fromIndex, 1)[0]
  favorites.value.splice(toIndex, 0, item)

  // Persist new order to DB
  const ids = favorites.value.map(f => f.id).filter(Boolean)
  if (ids.length) {
    api.reorderSongs(ids)
  }
  emit('updated')
  dragOverIndex.value = -1
  dragIndex.value = -1
}

function onDragEnd() {
  dragIndex.value = -1
  dragOverIndex.value = -1
}



// --- Favorites (data owned by parent via prop, mutations go through API) ---

function removeFavorite(index) {
  const fav = favorites.value[index]
  favorites.value.splice(index, 1)
  if (fav && fav.id) {
    api.deleteSong(fav.id)
  }
  emit('updated')
  confirmDeleteIndex.value = -1
  if (favPage.value > favTotalPages.value) favPage.value = favTotalPages.value
}

function onDeleteClick(index) {
  if (confirmDeleteIndex.value === index) {
    removeFavorite(index)
  } else {
    confirmDeleteIndex.value = index
    clearTimeout(confirmTimer)
    confirmTimer = setTimeout(() => { confirmDeleteIndex.value = -1 }, 3000)
  }
}

function incrementPlayed(index) {
  const fav = favorites.value[index]
  fav.played = !fav.played
  if (fav.played) {
    fav.playCount = (fav.playCount || 0) + 1
  }
  if (fav.id) {
    api.updateSong(fav.id, { played: fav.played, playCount: fav.playCount })
  }
  emit('updated')
}

async function resetAllPlayed() {
  for (const fav of favorites.value) {
    fav.played = false
  }
  await api.bulkUpdate('played', false)
  emit('updated')
}

function exportFavorites() {
  // Download from server API
  const a = document.createElement('a')
  a.href = '/api/export'
  a.download = `lyricmachine-favorites-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`
  a.click()
}

function triggerImport() {
  fileInput.value?.click()
}

async function importFavorites(e) {
  const file = e.target.files[0]
  if (!file) return

  try {
    const text = await file.text()
    const imported = JSON.parse(text)
    if (!Array.isArray(imported)) throw new Error()

    const result = await api.importSongs(imported)
    if (result) {
      const songs = await api.getSongs()
      if (songs) favorites.value = songs
      emit('updated')
    }
  } catch {
    // silently ignore bad files
  }
  e.target.value = ''
}

// --- Search with debounce ---
const debouncedSearch = useDebounceFn((term) => doSearch(term), 400)

watch(query, (val) => {
  const term = val.trim()

  if (!term) {
    searchResults.value = []
    searching.value = false
    searched.value = false
    return
  }

  searching.value = true
  searched.value = false
  debouncedSearch(term)
})

async function doSearch(term) {
  try {
    const res = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(term)}`)
    if (!res.ok) throw new Error('API error')

    const data = await res.json()
    searchResults.value = data.filter(item => item.plainLyrics)
  } catch {
    searchResults.value = []
  }
  searching.value = false
  searched.value = true
}

function isFavorited(result) {
  const title = [result.artistName, result.trackName].filter(Boolean).join(' — ')
  return favorites.value.some(f => f.title === title)
}

async function toggleFavoriteResult(result) {
  const title = [result.artistName, result.trackName].filter(Boolean).join(' — ')
  const idx = favorites.value.findIndex(f => f.title === title)
  if (idx >= 0) {
    const fav = favorites.value[idx]
    favorites.value.splice(idx, 1)
    if (fav.id) api.deleteSong(fav.id)
  } else {
    const created = await api.createSong({ title, lyrics: result.plainLyrics })
    if (created) {
      favorites.value.push(created)
    }
  }
  emit('updated')
}

function selectResult(result) {
  const title = [result.artistName, result.trackName].filter(Boolean).join(' — ')
  emit('select', { title, lyrics: result.plainLyrics })
  query.value = ''
}

// --- Init ---
function onLibraryKeydown(e) {
  if (e.ctrlKey || e.altKey || e.metaKey) return
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
  if (e.key === 'r' || e.key === 'R') {
    e.preventDefault()
    emit('open-randomizer')
  }
}

useEventListener(document, 'click', closeFilterDropdown)
useEventListener(document, 'click', closeContextMenu)
useEventListener(document, 'keydown', onLibraryKeydown)

onMounted(async () => {
  // Load filter preferences from server
  const filters = await api.getFilters()
  if (filters) {
    if (filters.hidePlayed !== undefined) hidePlayed.value = filters.hidePlayed
    if (filters.noChords !== undefined) filterNoChords.value = filters.noChords
  }
  inputRef.value?.focus()

  // Measure container to calculate how many rows fit
  await nextTick()
  const el = favContainerRef.value
  if (el) {
    const available = el.clientHeight - 90
    rowsPerPage.value = Math.max(2, Math.floor(available / CARD_HEIGHT) - 2)
  }
})
</script>

<style scoped>
.library-overlay .library-panel {
  width: 100vw;
  height: 100vh;
  background: var(--bg-input);
  border: none;
  border-radius: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.library-search {
  display: flex;
  align-items: stretch;
  gap: 0.75rem;
  padding: 1.25rem 1.5rem 0rem;
}

.library-input {
  width: 100%;
  padding: 0.85rem 1.1rem;
  font-size: 1.3rem;
  font-family: inherit;
  background: var(--bg-elevated);
  color: var(--text-primary);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  outline: none;
  caret-color: var(--accent);
  transition: border-color var(--speed-normal);
}

.library-input::placeholder {
  color: var(--text-dim);
}

.library-input:focus {
  border-color: var(--border-light);
}

.library-section-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.8rem 1.5rem 0.5rem;
  font-size: var(--font-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-dim);
}

.library-actions {
  display: flex;
  gap: 0.35rem;
  flex-shrink: 0;
}

.library-actions .action-btn {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  color: var(--text-dim);
  aspect-ratio: 1;
  height: 100%;
  padding: 0;
  font-size: 1.2rem;
  font-family: inherit;
  border-radius: var(--radius-sm);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color var(--speed-normal), border-color var(--speed-normal);
}

.library-actions .action-btn:hover {
  color: var(--text-primary);
  border-color: var(--border-light);
}

.filter-wrapper {
  position: relative;
}

.filter-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--color-teal);
  color: var(--bg-app);
  font-size: 0.6rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.filter-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  background: var(--bg-surface);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  padding: 0.5rem 0;
  min-width: 160px;
  z-index: 100;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
}

.filter-item {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.5rem 1rem;
  cursor: pointer;
  font-size: var(--font-sm);
  color: var(--text-muted);
  transition: background var(--speed-fast);
}

.filter-btn {
  background: none;
  border: none;
  width: 100%;
  justify-content: space-between;
}

.filter-btn.active {
  color: var(--color-teal);
}

.sort-arrow {
  font-size: 0.75rem;
  opacity: 0.7;
}

.filter-item:hover {
  background: var(--bg-hover-subtle);
}

.filter-item input[type="checkbox"] {
  accent-color: var(--color-teal);
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.library-results {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.library-favorites {
  flex: 1;
  overflow: hidden;
  min-height: 0;
}

.library-results::-webkit-scrollbar {
  width: 4px;
}

.library-results::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
}

.library-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.4rem;
  padding: 1rem 1.25rem 0.75rem;
}

.favorites-grid {
  grid-auto-flow: column;
}

.library-item.drag-over {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.library-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  cursor: pointer;
  border-radius: var(--radius-sm);
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  transition: background var(--speed-fast), border-color var(--speed-fast);
  position: relative;
}

.card-top-right {
  position: absolute;
  top: 0.75rem;
  right: 1rem;
  display: flex;
  align-items: center;
  gap: var(--space-md);
  z-index: 1;
}

.label-dot-indicator {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  opacity: 0.7;
}

.not-in-playlist-icon {
  color: var(--text-dim);
  opacity: 0.6;
}

.play-count {
  font-size: 1.2rem;
  color: var(--text-dim);
  user-select: none;
  line-height: 1;
}

.library-item-actions {
  position: absolute;
  bottom: 0.75rem;
  right: 1rem;
  display: flex;
  gap: 2px;
  z-index: 1;
}

/* Context menu */
.ctx-menu {
  position: fixed;
  z-index: 9999;
  background: rgba(30, 30, 30, 0.95);
  backdrop-filter: blur(10px);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  padding: var(--space-xs);
  min-width: 150px;
}

.ctx-option {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  width: 100%;
  background: none;
  border: none;
  color: rgba(255,255,255,0.7);
  padding: 0.4rem 0.6rem;
  border-radius: var(--radius-xs);
  cursor: pointer;
  font-size: var(--font-sm);
}

.ctx-option:hover {
  background: var(--bg-hover);
  color: #fff;
}

.ctx-option.active {
  font-weight: 600;
  color: var(--accent);
}

.ctx-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.ctx-divider {
  height: 1px;
  background: var(--border-light);
  margin: var(--space-xs) 0;
}

.ctx-delete {
  color: rgba(255, 85, 85, 0.7) !important;
}

.ctx-delete:hover {
  color: #ff5555 !important;
  background: rgba(255, 85, 85, 0.1) !important;
}

.filter-divider {
  height: 1px;
  background: var(--border-light);
  margin: var(--space-xs) 0;
}

.filter-label-dot::before {
  content: '';
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--lc);
  margin-right: 4px;
  vertical-align: middle;
}

.library-item:hover {
  background: var(--bg-surface);
  border-color: var(--border);
}

.library-item-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding-right: 4rem;
}

.library-item-artist {
  font-size: 1.05rem;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.library-item-track {
  font-size: 1.3rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.library-item .delete-btn {
  background: none;
  border: 1px solid transparent;
  color: #444;
  font-size: var(--font-xs);
  width: 20px;
  height: 20px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 3px;
  transition: color var(--speed-normal), border-color var(--speed-normal);
  opacity: 0;
}

.library-item:hover .delete-btn {
  opacity: 1;
}

.library-item .delete-btn:hover {
  color: #ff5555;
  background: rgba(255, 85, 85, 0.1);
}

.library-item .delete-btn.confirming {
  opacity: 1;
  color: #ff5555;
  border-color: rgba(255, 85, 85, 0.4);
  background: rgba(255, 85, 85, 0.1);
}

.star-btn-inline {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1.3rem;
  line-height: 1;
  color: #555;
  padding: 0.1rem 0.3rem;
  transition: color var(--speed-normal), transform var(--speed-fast);
  flex-shrink: 0;
}

.star-btn-inline:hover {
  color: var(--accent);
  transform: scale(1.15);
}

.star-btn-inline.saved {
  color: var(--accent);
}

.library-status {
  padding: 0.5rem 1.5rem;
  font-size: var(--font-sm);
  color: var(--text-dim);
}

.library-status-center {
  padding: 3rem 1rem;
  text-align: center;
  color: rgba(255, 255, 255, 0.25);
  font-size: 0.9rem;
}

.library-page-nav {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 0.75rem 0;
}

.page-btn {
  background: #161616;
  border: 1px solid var(--border);
  color: #999;
  padding: 0.35rem 0.8rem;
  font-size: 1rem;
  font-family: inherit;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: color var(--speed-normal), border-color var(--speed-normal);
}

.page-btn:hover:not(:disabled) {
  color: #e8e8e8;
  border-color: #444;
}

.page-btn:disabled {
  opacity: 0.25;
  cursor: default;
}

.page-info {
  font-size: var(--font-sm);
  color: rgba(255, 255, 255, 0.35);
  letter-spacing: 0.05em;
}

.settings-panel {
  padding: 0.5rem 1rem;
  margin: 1rem 1.25rem 0.5rem;
  background: var(--bg-elevated);
  border: 1px solid #1e1e1e;
  border-radius: var(--radius-sm);
}

.new-song-form {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.new-song-row {
  display: flex;
  gap: 0.5rem;
}

.new-song-input {
  flex: 1;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: var(--radius-xs);
  padding: 0.4rem 0.6rem;
  font-size: var(--font-sm);
  color: #eee;
  outline: none;
}

.new-song-input:focus {
  border-color: var(--accent);
}

.new-song-lyrics {
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: var(--radius-xs);
  padding: 0.5rem 0.6rem;
  font-size: var(--font-sm);
  font-family: 'Inter', monospace;
  color: #ddd;
  resize: vertical;
  outline: none;
  min-height: 100px;
}

.new-song-lyrics:focus {
  border-color: var(--accent);
}

.new-song-submit {
  align-self: flex-start;
  padding: 0.35rem 1rem;
  font-size: var(--font-sm);
  background: var(--accent-15);
  border: 1px solid var(--accent-30);
  border-radius: var(--radius-xs);
  color: var(--accent);
  cursor: pointer;
  transition: all var(--speed-fast);
}

.new-song-submit:hover:not(:disabled) {
  background: var(--accent-25);
}

.new-song-submit:disabled {
  opacity: 0.3;
  cursor: default;
}

/* Played status */
.played-check {
  width: 20px;
  height: 20px;
  border: 1px solid var(--border-light);
  border-radius: 3px;
  background: transparent;
  color: transparent;
  font-size: var(--font-xs);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--speed-fast);
  opacity: 0;
}

.library-item:hover .played-check,
.played-check.checked {
  opacity: 1;
}

.played-check.checked {
  background: rgba(46, 204, 113, 0.15);
  border-color: rgba(46, 204, 113, 0.4);
  color: var(--color-success);
}

.library-item.is-played {
  opacity: 0.4;
}

.library-item.is-played:hover {
  opacity: 0.7;
}

.action-btn.active {
  color: #f5c542;
  border-color: var(--accent-30);
}
</style>
