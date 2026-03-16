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
        <div v-if="showNewSong" class="settings-panel">
          <div class="new-song-form">
            <div class="new-song-row">
              <input v-model="newArtist" class="new-song-input" placeholder="Artist" @keydown.enter="$refs.newTrackInput?.focus()" />
              <input ref="newTrackInput" v-model="newTrack" class="new-song-input" placeholder="Track" @keydown.enter="$refs.newLyricsInput?.focus()" />
            </div>
            <textarea ref="newLyricsInput" v-model="newLyrics" class="new-song-lyrics" placeholder="Paste or type lyrics here…" rows="6"></textarea>
            <button class="new-song-submit" :disabled="!newArtist.trim() || !newTrack.trim()" @click="createNewSong">Create Song</button>
          </div>
        </div>
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
                title="Increment play count"
                @click.stop="incrementPlayed(entry.realIndex)"
              >{{ entry.fav.played ? '✓' : '' }}</button>
              <span class="label-dot-indicator" :style="{ background: labelColor(entry.fav.label) }"></span>
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
      <div
        v-if="ctxMenu.show"
        class="ctx-menu"
        :style="{ top: ctxMenu.y + 'px', left: ctxMenu.x + 'px' }"
        @click.stop
      >
        <button
          v-for="opt in labelOptions" :key="opt.value"
          class="ctx-option"
          :class="{ active: ctxMenu.fav?.label === opt.value }"
          @click="setLabelFromCtx(opt.value)"
        >
          <span class="ctx-dot" :style="{ background: opt.color }"></span>
          {{ opt.name }}
        </button>
        <div class="ctx-divider"></div>
        <button class="ctx-option" @click="incrementPlayedFromCtx">
          <MdiIcon :path="mdiCheck" :size="14" /> Played{{ ctxMenu.fav?.playCount ? ` (${ctxMenu.fav.playCount})` : '' }}
        </button>
        <button class="ctx-option" @click="editPlayCountFromCtx">
          <MdiIcon :path="mdiPencil" :size="14" /> Edit Count
        </button>
        <button class="ctx-option" @click="clearPlayCountFromCtx">
          <MdiIcon :path="mdiRefresh" :size="14" /> Clear Count
        </button>
        <div class="ctx-divider"></div>
        <button class="ctx-option ctx-delete" @click="deleteFromCtx">
          <MdiIcon :path="mdiDelete" :size="14" /> Remove
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import MdiIcon from './MdiIcon.vue'
import {
  mdiPlus, mdiDownload, mdiUpload, mdiFilterVariant, mdiRefresh,
  mdiViewColumn, mdiDice5, mdiCog, mdiChevronLeft, mdiChevronRight,
  mdiCheck, mdiPencil, mdiDelete, mdiSort, mdiHome,
} from '@mdi/js'

const STORAGE_KEY = 'lyricmachine_favorites'
const DEFAULTS_KEY = 'lyricmachine_defaults'

const props = defineProps({
  favorites: { type: Array, required: true },
})

const emit = defineEmits(['close', 'go-home', 'select', 'updated', 'defaults-changed', 'toggle-settings', 'open-randomizer', 'open-kanban'])

const query = ref('')
const inputRef = ref(null)
const favContainerRef = ref(null)
const backdropMouseDown = ref(false)
const showSettings = ref(false)
const showNewSong = ref(false)
const hidePlayed = ref(JSON.parse(localStorage.getItem('lm_filter_hidePlayed') || 'false'))
const filterNoChords = ref(JSON.parse(localStorage.getItem('lm_filter_noChords') || 'false'))
const filterFresh = ref(false)
const filterGettingThere = ref(false)
const filterInSetlist = ref(false)
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

const labelOptions = [
  { value: 'fresh', name: 'Fresh', color: '#e74c3c' },
  { value: 'getting-there', name: 'Getting There', color: '#f1c40f' },
  { value: 'in-setlist', name: 'In Setlist', color: '#2ecc71' },
]

function labelColor(label) {
  const opt = labelOptions.find(o => o.value === label)
  return opt ? opt.color : 'transparent'
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
    favorites.value[ctxMenu.index].label = label
    saveFavorites()
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

function incrementPlayedFromCtx() {
  if (ctxMenu.index >= 0) {
    const fav = favorites.value[ctxMenu.index]
    fav.played = !fav.played
    if (fav.played) {
      fav.playCount = (fav.playCount || 0) + 1
    }
    saveFavorites()
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
        favorites.value[ctxMenu.index].playCount = num
        saveFavorites()
      }
    }
  }
}

function clearPlayCountFromCtx() {
  if (ctxMenu.index >= 0) {
    favorites.value[ctxMenu.index].playCount = 0
    favorites.value[ctxMenu.index].played = false
    saveFavorites()
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
  return count
})

function closeFilterDropdown(e) {
  if (showFilterDropdown.value) showFilterDropdown.value = false
  if (showSortDropdown.value) showSortDropdown.value = false
}

watch(hidePlayed, v => localStorage.setItem('lm_filter_hidePlayed', JSON.stringify(v)))
watch(filterNoChords, v => localStorage.setItem('lm_filter_noChords', JSON.stringify(v)))
const newArtist = ref('')
const newTrack = ref('')
const newLyrics = ref('')

const defaults = ref({
  altColors: true,
  separators: false,
  merge: false,
})

function loadDefaults() {
  try {
    const saved = JSON.parse(localStorage.getItem(DEFAULTS_KEY))
    if (saved) Object.assign(defaults.value, saved)
  } catch {}
}

function saveDefaults() {
  localStorage.setItem(DEFAULTS_KEY, JSON.stringify(defaults.value))
  emit('defaults-changed', { ...defaults.value })
}

const applyStatus = ref('')

function applyDefaultsToAll() {
  let favs = []
  try { favs = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [] } catch {}
  if (!favs.length) {
    applyStatus.value = 'No favorites to update'
    setTimeout(() => applyStatus.value = '', 2000)
    return
  }
  for (const fav of favs) {
    fav.altColors = defaults.value.altColors
    fav.separators = defaults.value.separators
    fav.merge = defaults.value.merge
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(favs))
  favorites.value = favs
  applyStatus.value = `Updated ${favs.length} favorites`
  setTimeout(() => applyStatus.value = '', 2000)
  emit('updated')
}

function createNewSong() {
  const artist = newArtist.value.trim()
  const track = newTrack.value.trim()
  if (!artist || !track) return

  const title = `${artist} — ${track}`
  const lyrics = newLyrics.value || ''

  // Add to favorites
  const existing = favorites.value.findIndex(f => f.title === title)
  if (existing < 0) {
    favorites.value.unshift({ title, lyrics })
    saveFavorites()
  }

  // Load it
  emit('select', { title, lyrics })

  // Reset form
  newArtist.value = ''
  newTrack.value = ''
  newLyrics.value = ''
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
const favorites = ref([])
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
      if (sortBy.value === 'label') {
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
  return displayedFavorites.value
    .slice(start, start + perPage.value)
    .map((fav, i) => {
      // Find real index in the full favorites array
      const realIndex = favorites.value.indexOf(fav)
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
  saveFavorites()
  dragOverIndex.value = -1
  dragIndex.value = -1
}

function onDragEnd() {
  dragIndex.value = -1
  dragOverIndex.value = -1
}

function splitTitle(title) {
  const sep = title.indexOf(' — ')
  if (sep >= 0) {
    return { artist: title.slice(0, sep), track: title.slice(sep + 3) }
  }
  return { artist: '', track: title }
}

// --- Favorites ---
function loadFavorites() {
  try {
    favorites.value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  } catch {
    favorites.value = []
  }
}

function saveFavorites() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites.value))
  emit('updated')
}

function removeFavorite(index) {
  favorites.value.splice(index, 1)
  saveFavorites()
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
  saveFavorites()
}

function resetAllPlayed() {
  for (const fav of favorites.value) {
    fav.played = false
  }
  saveFavorites()
}

function exportFavorites() {
  const blob = new Blob([JSON.stringify(favorites.value, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  a.href = url
  a.download = `lyricmachine-favorites-${ts}.json`
  a.click()
  URL.revokeObjectURL(url)
}

function triggerImport() {
  fileInput.value?.click()
}

function importFavorites(e) {
  const file = e.target.files[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = () => {
    try {
      const imported = JSON.parse(reader.result)
      if (!Array.isArray(imported)) throw new Error()
      const existing = new Set(favorites.value.map(f => f.title))
      const newItems = imported.filter(item =>
        item.title && item.lyrics && !existing.has(item.title)
      )
      favorites.value.push(...newItems)
      saveFavorites()
    } catch {
      // silently ignore bad files
    }
  }
  reader.readAsText(file)
  e.target.value = ''
}

// --- Search with debounce ---
watch(query, (val) => {
  clearTimeout(searchTimer)
  const term = val.trim()

  if (!term) {
    searchResults.value = []
    searching.value = false
    searched.value = false
    return
  }

  searching.value = true
  searched.value = false
  searchTimer = setTimeout(() => doSearch(term), 400)
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

function toggleFavoriteResult(result) {
  const title = [result.artistName, result.trackName].filter(Boolean).join(' — ')
  const idx = favorites.value.findIndex(f => f.title === title)
  if (idx >= 0) {
    favorites.value.splice(idx, 1)
  } else {
    favorites.value.push({ title, lyrics: result.plainLyrics })
  }
  saveFavorites()
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

onMounted(async () => {
  loadFavorites()
  loadDefaults()
  inputRef.value?.focus()

  // Measure container to calculate how many rows fit
  await nextTick()
  const el = favContainerRef.value
  if (el) {
    const available = el.clientHeight - 90
    rowsPerPage.value = Math.max(2, Math.floor(available / CARD_HEIGHT) - 2)
  }


  document.addEventListener('click', closeFilterDropdown)
  document.addEventListener('click', closeContextMenu)
  document.addEventListener('keydown', onLibraryKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', closeFilterDropdown)
  document.removeEventListener('click', closeContextMenu)
  document.removeEventListener('keydown', onLibraryKeydown)
})
</script>

<style scoped>
.library-overlay .library-panel {
  width: 100vw;
  height: 100vh;
  background: #0a0a0a;
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
  color: #e8e8e8;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  outline: none;
  caret-color: var(--accent);
  transition: border-color var(--speed-normal);
}

.library-input::placeholder {
  color: rgba(255, 255, 255, 0.25);
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
  background: #161616;
  border: 1px solid var(--border);
  color: #666;
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
  color: #e8e8e8;
  border-color: #444;
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
  background: #64ffda;
  color: #000;
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
  color: #ccc;
  transition: background var(--speed-fast);
}

.filter-btn {
  background: none;
  border: none;
  width: 100%;
  justify-content: space-between;
}

.filter-btn.active {
  color: #64ffda;
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
  outline: 2px solid #f5c542;
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
  border: 1px solid #1e1e1e;
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

.play-count {
  font-size: 1.2rem;
  color: rgba(255,255,255,0.3);
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
  padding-right: 1.5rem;
}

.library-item-artist {
  font-size: 1.05rem;
  color: rgba(255, 255, 255, 0.4);
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
