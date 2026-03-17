<template>
  <div class="overlay-backdrop settings-overlay" @mousedown.self="backdropDown = true" @mouseup.self="onBackdropUp">
    <div class="modal-panel settings-modal">
      <button class="close-btn" @click="$emit('close')" title="Close"><MdiIcon :path="mdiClose" :size="18" /></button>

      <div class="settings-columns">
        <!-- Column 1: Defaults -->
        <div class="settings-col">
          <div class="settings-section-title">Defaults for new songs</div>
          <label class="setting-row">
            <span>Alternating colors</span>
            <input type="checkbox" v-model="defaults.altColors" @change="$emit('save-defaults')" />
          </label>
          <label class="setting-row">
            <span>Section separators</span>
            <input type="checkbox" v-model="defaults.separators" @change="$emit('save-defaults')" />
          </label>
          <label class="setting-row">
            <span>Line merging</span>
            <input type="checkbox" v-model="defaults.merge" @change="$emit('save-defaults')" />
          </label>
          <button class="accent-btn apply-all-btn" @click="$emit('apply-defaults-to-all')">Apply defaults to all</button>
          <span v-if="applyStatus" class="apply-status">{{ applyStatus }}</span>
          <button class="accent-btn accent-btn--danger apply-all-btn" @click="onClearChords">
            {{ confirmClearChords ? 'Are you sure?' : 'Clear all chords' }}
          </button>
          <span v-if="resetChordStatus" class="apply-status">{{ resetChordStatus }}</span>
          <button class="accent-btn apply-all-btn" @click="$emit('clear-played-status')">Clear played status</button>
          <button class="accent-btn apply-all-btn" @click="openBookmarklet">UG Import bookmarklet</button>

          <div class="settings-divider"></div>
          <div class="settings-section-title">Data</div>
          <div class="backup-row">
            <button class="accent-btn apply-all-btn" @click="exportBackup">↓ Backup</button>
            <button class="accent-btn apply-all-btn" @click="restoreFileInput?.click()">↑ Restore</button>
          </div>
          <span v-if="restoreStatus" class="apply-status">{{ restoreStatus }}</span>
          <input
            ref="restoreFileInput"
            type="file"
            accept=".json"
            style="display: none"
            @change="importRestore"
          />
        </div>

        <!-- Column 2: Keyboard shortcuts -->
        <div class="settings-col">
          <div class="settings-section-title">Keyboard shortcuts</div>
          <div class="shortcut-row"><kbd>Space</kbd> <span>Open / close library</span></div>
          <div class="shortcut-row"><kbd>H</kbd> <span>Toggle alternating colors</span></div>
          <div class="shortcut-row"><kbd>L</kbd> <span>Toggle section separators</span></div>
          <div class="shortcut-row"><kbd>M</kbd> <span>Toggle line merging</span></div>
          <div class="shortcut-row"><kbd>T</kbd> <span>Search chords (Ultimate Guitar)</span></div>
          <div class="shortcut-row"><kbd>+ / −</kbd> <span>Adjust font size</span></div>
          <div class="shortcut-row"><kbd>← →</kbd> <span>Navigate pages</span></div>
        </div>

        <!-- Column 3: Spotify & Band -->
        <div class="settings-col">
          <div class="settings-section-title">Spotify & Band</div>

          <!-- Band name -->
          <label class="setting-row setting-row--input">
            <span>Band name</span>
            <input
              type="text"
              class="settings-text-input"
              v-model="bandNameInput"
              placeholder="My Band"
              @blur="saveBandName"
              @keydown.enter="$event.target.blur()"
            />
          </label>

          <!-- Mosaic genres -->
          <label class="setting-row setting-row--input">
            <span>Mosaic genres</span>
            <input
              type="text"
              class="settings-text-input"
              v-model="mosaicGenresInput"
              placeholder="grunge, punk"
              @blur="saveMosaicGenres"
              @keydown.enter="$event.target.blur()"
            />
          </label>

          <!-- Spotify connection -->
          <div v-if="spotifyConnected" class="spotify-status">
            <div class="spotify-connected">
              <MdiIcon :path="mdiSpotify" :size="16" />
              <span>{{ spotifyUser }}</span>
            </div>
            <button class="accent-btn accent-btn--danger accent-btn--sm" @click="onDisconnect">Disconnect</button>
          </div>
          <button v-else class="accent-btn apply-all-btn spotify-connect-btn" @click="connectSpotify">
            <MdiIcon :path="mdiSpotify" :size="16" />
            Connect Spotify
          </button>

          <!-- Source playlist picker (when connected) -->
          <template v-if="spotifyConnected">
            <label class="setting-row setting-row--input">
              <span>Source playlist</span>
              <select
                class="settings-select"
                v-model="selectedPlaylist"
                @change="saveSourcePlaylist"
              >
                <option value="">None</option>
                <option
                  v-for="pl in userPlaylists"
                  :key="pl.id"
                  :value="pl.id"
                >{{ pl.name }}</option>
              </select>
            </label>

            <!-- Label playlist sync toggle -->
            <label class="setting-row">
              <span>Sync labels to playlists</span>
              <input type="checkbox" v-model="labelSyncEnabled" @change="saveLabelSync" />
            </label>

            <!-- Sync button -->
            <button
              class="accent-btn apply-all-btn"
              :disabled="syncing"
              @click="triggerSync"
            >
              {{ syncing ? 'Syncing…' : 'Sync with Spotify' }}
            </button>
            <span v-if="syncStatus" class="apply-status">{{ syncStatus }}</span>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import MdiIcon from './MdiIcon.vue'
import { mdiClose, mdiSpotify } from '@mdi/js'
import { api } from '../api.js'
import { useFavorites } from '../composables/useFavorites.js'

const props = defineProps({
  defaults: { type: Object, required: true },
  applyStatus: { type: String, default: '' },
  resetChordStatus: { type: String, default: '' },
  spotifyConnected: { type: Boolean, default: false },
  spotifyUser: { type: String, default: '' },
})

const emit = defineEmits([
  'save-defaults', 'apply-defaults-to-all', 'reset-all-chords',
  'clear-played-status', 'close',
  'connect-spotify', 'disconnect-spotify', 'trigger-sync',
])

const { favorites, loadFavorites } = useFavorites()

const backdropDown = ref(false)
const confirmClearChords = ref(false)
let confirmTimer = null
const restoreFileInput = ref(null)
const restoreStatus = ref('')

// Band name
const bandNameInput = ref('')

// Mosaic genres
const mosaicGenresInput = ref('')

// Spotify
const userPlaylists = ref([])
const selectedPlaylist = ref('')
const labelSyncEnabled = ref(false)
const syncing = ref(false)
const syncStatus = ref('')

function onBackdropUp() {
  if (backdropDown.value) emit('close')
  backdropDown.value = false
}

function onClearChords() {
  if (confirmClearChords.value) {
    emit('reset-all-chords')
    confirmClearChords.value = false
    clearTimeout(confirmTimer)
  } else {
    confirmClearChords.value = true
    clearTimeout(confirmTimer)
    confirmTimer = setTimeout(() => { confirmClearChords.value = false }, 3000)
  }
}

function openBookmarklet() {
  window.open('/api/bookmarklet', '_blank')
}

// --- Backup / Restore ---
function exportBackup() {
  const a = document.createElement('a')
  a.href = '/api/export'
  a.download = 'lyricmachine-backup.json'
  a.click()
}

async function importRestore(e) {
  const file = e.target.files[0]
  if (!file) return
  try {
    const text = await file.text()
    const imported = JSON.parse(text)
    if (!Array.isArray(imported)) throw new Error('Invalid format')
    const result = await api.importSongs(imported)
    if (result) {
      await loadFavorites()
      restoreStatus.value = 'Restore complete!'
    } else {
      restoreStatus.value = 'Restore failed'
    }
  } catch {
    restoreStatus.value = 'Invalid file'
  }
  e.target.value = ''
  setTimeout(() => { restoreStatus.value = '' }, 4000)
}

// --- Band name ---
async function loadBandName() {
  const data = await api.getSetting('band_name')
  if (typeof data === 'string') bandNameInput.value = data
  else if (data?.value) bandNameInput.value = data.value
}

async function saveBandName() {
  await api.setSetting('band_name', bandNameInput.value)
}

// --- Mosaic genres ---
async function loadMosaicGenres() {
  const data = await api.getSetting('mosaic_genres')
  if (Array.isArray(data)) mosaicGenresInput.value = data.join(', ')
}

async function saveMosaicGenres() {
  const genres = mosaicGenresInput.value
    .split(',')
    .map(g => g.trim().toLowerCase())
    .filter(Boolean)
  await api.setSettingRaw('mosaic_genres', genres)
}

// --- Spotify ---
function connectSpotify() {
  emit('connect-spotify')
}

function onDisconnect() {
  emit('disconnect-spotify')
}

async function loadUserPlaylists() {
  if (!props.spotifyConnected) return
  const data = await api.getSpotifyPlaylists()
  if (data) userPlaylists.value = data.playlists || []
}

async function loadSourcePlaylist() {
  const data = await api.getSetting('spotify_source_playlist')
  if (typeof data === 'string') selectedPlaylist.value = data
  else if (data?.value) selectedPlaylist.value = data.value
  else selectedPlaylist.value = ''
}

async function saveSourcePlaylist() {
  await api.setSetting('spotify_source_playlist', selectedPlaylist.value)
}

async function loadLabelSync() {
  const data = await api.getSetting('spotify_label_sync')
  labelSyncEnabled.value = !!(data?.value ?? data)
}

async function saveLabelSync() {
  await api.setSetting('spotify_label_sync', labelSyncEnabled.value)
}

async function triggerSync() {
  syncing.value = true
  syncStatus.value = ''
  try {
    const data = await api.syncSpotify()
    syncStatus.value = data?.error ? `Error: ${data.error}` : 'Sync complete!'
    emit('trigger-sync')
  } catch (err) {
    syncStatus.value = 'Sync failed'
  } finally {
    syncing.value = false
    setTimeout(() => { syncStatus.value = '' }, 4000)
  }
}

onMounted(async () => {
  loadBandName()
  loadMosaicGenres()
  loadLabelSync()
  if (props.spotifyConnected) {
    loadUserPlaylists()
    loadSourcePlaylist()
  }
})
</script>

<style scoped>
.settings-modal {
  padding: 2rem 2rem 1.5rem;
  max-width: 850px;
  width: 90vw;
}

.settings-overlay {
  z-index: 300;
}

.settings-columns {
  display: flex;
  gap: 2rem;
}

.settings-col {
  flex: 1;
}

.settings-section-title {
  font-size: var(--font-xs);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-dim);
  padding: 0.25rem 0.5rem;
  margin-bottom: 0.15rem;
}

.setting-row {
  display: flex;
  flex-direction: row-reverse;
  justify-content: flex-end;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-xs) 0.5rem;
  font-size: var(--font-sm);
  color: var(--text-muted);
  cursor: pointer;
  border-radius: var(--radius-xs);
}

.setting-row--input {
  flex-direction: column;
  align-items: stretch;
  gap: 0.25rem;
  cursor: default;
}

.setting-row:hover {
  color: var(--text-primary);
  background: var(--bg-hover-subtle);
}

.setting-row input[type="checkbox"] {
  width: 16px;
  height: 16px;
  accent-color: var(--accent);
  cursor: pointer;
}

.settings-text-input,
.settings-select {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-xs);
  color: var(--text-primary);
  font-size: var(--font-sm);
  font-family: inherit;
  padding: 0.35rem 0.5rem;
  outline: none;
  transition: border-color var(--speed-fast);
}

.settings-text-input:focus,
.settings-select:focus {
  border-color: var(--accent);
}

.settings-select {
  cursor: pointer;
}

.settings-select option {
  background: var(--bg-elevated);
  color: var(--text-primary);
}

.apply-all-btn {
  display: block;
  margin-top: var(--space-md);
  margin-left: 0.5rem;
}

.apply-status {
  display: block;
  margin-top: 0.25rem;
  font-size: var(--font-xs);
  color: var(--accent);
}

.shortcut-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.2rem 0.5rem;
  font-size: var(--font-sm);
  color: var(--text-dim);
}

.shortcut-row kbd {
  display: inline-block;
  min-width: 2rem;
  text-align: center;
  padding: 0.1rem 0.4rem;
  font-size: var(--font-xs);
  font-family: inherit;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-xs);
  color: var(--text-muted);
}

/* Spotify section */
.spotify-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
  padding: var(--space-xs) 0.5rem;
  margin-top: var(--space-sm);
}

.spotify-connected {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: var(--font-sm);
  color: #1DB954;
}

.spotify-connect-btn {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.accent-btn--sm {
  padding: 0.2rem 0.6rem;
  font-size: var(--font-xs);
}

.settings-divider {
  height: 1px;
  background: var(--border-light);
  margin: var(--space-md) 0.5rem;
}

.backup-row {
  display: flex;
  gap: var(--space-sm);
  margin-left: 0.5rem;
  margin-top: var(--space-md);
}

.backup-row .apply-all-btn {
  margin-top: 0;
}
</style>
