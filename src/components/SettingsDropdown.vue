<template>
  <div class="overlay-backdrop settings-overlay" @mousedown.self="backdropDown = true" @mouseup.self="onBackdropUp">
    <div class="modal-panel settings-modal">
      <button class="close-btn" @click="$emit('close')" title="Close"><MdiIcon :path="mdiClose" :size="18" /></button>

      <div class="settings-columns">
        <!-- Column 1: Display + Shortcuts -->
        <div class="settings-col">
          <div class="settings-section">
            <div class="settings-section-title">Display Defaults</div>
            <label class="setting-row">
              <input type="checkbox" v-model="defaults.altColors" @change="$emit('save-defaults')" />
              <span>Alternating colors</span>
            </label>
            <label class="setting-row">
              <input type="checkbox" v-model="defaults.separators" @change="$emit('save-defaults')" />
              <span>Section separators</span>
            </label>
            <label class="setting-row">
              <input type="checkbox" v-model="defaults.merge" @change="$emit('save-defaults')" />
              <span>Line merging</span>
            </label>
            <button class="accent-btn settings-btn" @click="$emit('apply-defaults-to-all')">Apply defaults to all</button>
            <span v-if="applyStatus" class="status-msg">{{ applyStatus }}</span>
          </div>

          <div class="settings-section">
            <div class="settings-section-title">Keyboard Shortcuts</div>
            <div class="shortcut-row"><kbd>Space</kbd> <span>Open / close library</span></div>
            <div class="shortcut-row"><kbd>H</kbd> <span>Toggle alternating colors</span></div>
            <div class="shortcut-row"><kbd>L</kbd> <span>Toggle section separators</span></div>
            <div class="shortcut-row"><kbd>M</kbd> <span>Toggle line merging</span></div>
            <div class="shortcut-row"><kbd>T</kbd> <span>Search chords (Ultimate Guitar)</span></div>
            <div class="shortcut-row"><kbd>+ / −</kbd> <span>Adjust font size</span></div>
            <div class="shortcut-row"><kbd>← →</kbd> <span>Navigate pages</span></div>
          </div>
        </div>

        <!-- Column 2: Band + Spotify -->
        <div class="settings-col">
          <div class="settings-section">
            <div class="settings-section-title">Band</div>
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
          </div>

          <div class="settings-section">
            <div class="settings-section-title">Spotify</div>
            <div v-if="spotifyConnected" class="spotify-status">
              <div class="spotify-connected">
                <MdiIcon :path="mdiSpotify" :size="16" />
                <span>{{ spotifyUser }}</span>
              </div>
              <button class="accent-btn accent-btn--danger accent-btn--sm" @click="onDisconnect">Disconnect</button>
            </div>
            <button v-else class="accent-btn settings-btn spotify-connect-btn" @click="connectSpotify">
              <MdiIcon :path="mdiSpotify" :size="16" />
              Connect Spotify
            </button>

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

              <button
                class="accent-btn settings-btn"
                :disabled="syncing"
                @click="triggerSync"
              >
                {{ syncing ? 'Syncing…' : 'Sync with Spotify' }}
              </button>
              <span v-if="syncStatus" class="status-msg">{{ syncStatus }}</span>
            </template>
          </div>
        </div>

        <!-- Column 3: Tools + Data + Danger Zone -->
        <div class="settings-col">
          <div class="settings-section">
            <div class="settings-section-title">Tools</div>
            <button class="accent-btn settings-btn" @click="openBookmarklet">UG Import bookmarklet</button>
          </div>

          <div class="settings-section">
            <div class="settings-section-title">Data</div>
            <div class="btn-row">
              <button class="accent-btn settings-btn" @click="exportBackup">↓ Backup</button>
              <button class="accent-btn settings-btn" @click="restoreFileInput?.click()">↑ Restore</button>
            </div>
            <span v-if="restoreStatus" class="status-msg">{{ restoreStatus }}</span>
            <input
              ref="restoreFileInput"
              type="file"
              accept=".json"
              style="display: none"
              @change="importRestore"
            />
          </div>

          <div class="settings-section">
            <div class="settings-section-title">Reset</div>
            <button class="accent-btn settings-btn" @click="onClearChords">
              {{ confirmClearChords ? 'Are you sure?' : 'Clear all chords' }}
            </button>
            <span v-if="resetChordStatus" class="status-msg">{{ resetChordStatus }}</span>
            <button class="accent-btn settings-btn" @click="$emit('clear-played-status')">Clear played status</button>
          </div>
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
  if (props.spotifyConnected) {
    loadUserPlaylists()
    loadSourcePlaylist()
  }
})
</script>

<style scoped>
.settings-modal {
  padding: 2rem 2.5rem 2rem;
  max-width: 56rem;
  width: 90vw;
}

.settings-overlay {
  z-index: 300;
}

.settings-columns {
  display: flex;
  gap: 0;
}

.settings-col {
  flex: 1;
  padding: 0 1.5rem;
}

.settings-col:first-child {
  padding-left: 0;
}

.settings-col:last-child {
  padding-right: 0;
}

.settings-col + .settings-col {
  border-left: 1px solid var(--border);
}

/* Sections within columns */
.settings-section {
  padding-bottom: var(--space-lg);
  margin-bottom: var(--space-lg);
}

.settings-section:last-child {
  margin-bottom: 0;
  padding-bottom: 0;
}

.settings-section:not(:last-child) {
  border-bottom: 1px solid var(--border);
}

.settings-section-title {
  font-size: var(--font-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-dim);
  margin-bottom: var(--space-md);
}

/* Setting rows */
.setting-row {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-xs) 0;
  font-size: var(--font-sm);
  color: var(--text-muted);
  cursor: pointer;
  border-radius: var(--radius-xs);
  transition: color var(--speed-fast);
}

.setting-row:hover {
  color: var(--text-primary);
}

.setting-row--input {
  flex-direction: column;
  align-items: stretch;
  gap: 0.25rem;
  cursor: default;
}

.setting-row--input:hover {
  color: var(--text-muted);
}

.setting-row input[type="checkbox"] {
  width: 1rem;
  height: 1rem;
  accent-color: var(--accent);
  cursor: pointer;
}

/* Inputs */
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

/* Buttons */
.settings-btn {
  display: block;
  width: 100%;
  text-align: center;
  margin-top: var(--space-md);
}

.btn-row {
  display: flex;
  gap: var(--space-sm);
}

.btn-row .settings-btn {
  flex: 1;
}

/* Status messages */
.status-msg {
  display: block;
  margin-top: var(--space-xs);
  font-size: var(--font-xs);
  color: var(--accent);
}

/* Shortcuts */
.shortcut-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.2rem 0;
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

/* Spotify */
.spotify-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
  padding: var(--space-xs) 0;
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
  justify-content: center;
  gap: 0.4rem;
}

.accent-btn--sm {
  padding: 0.2rem 0.6rem;
  font-size: var(--font-xs);
}


</style>
