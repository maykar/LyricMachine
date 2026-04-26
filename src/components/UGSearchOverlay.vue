<template>
  <div class="overlay-backdrop ug-overlay" @mousedown.self="onBackdropClick">
    <div class="modal-panel ug-panel">
      <!-- Header -->
      <div class="ug-header">
        <h2 class="ug-title">Ultimate Guitar Search</h2>
        <button class="close-btn close-btn--danger" @click="close" title="Close"><MdiIcon :path="mdiClose" :size="18" /></button>
      </div>

      <!-- Search Bar -->
      <div class="ug-search-container">
        <input
          ref="inputRef"
          v-model="searchQuery"
          class="ug-search-input"
          type="text"
          placeholder="Search for tabs (Artist - Title)..."
          @keydown.enter="performSearch"
          @keydown.escape="close"
        />
        <button class="ug-search-btn" @click="performSearch" :disabled="isSearching">
          <MdiIcon :path="mdiMagnify" :size="20" />
        </button>
      </div>

      <!-- Body / Columns -->
      <div class="ug-content">
        <!-- Result List Column -->
        <div class="ug-results">
          <div v-if="isSearching" class="ug-status">Searching...</div>
          <div v-else-if="results.length === 0" class="ug-status">
            {{ hasSearched ? 'No chord sheets found.' : 'Enter a query and search.' }}
          </div>
          <div 
            v-else 
            v-for="res in results" 
            :key="res.id"
            class="ug-result-card"
            :class="{ 'active': activeTabId === res.id }"
            @click="previewTab(res)"
          >
            <div class="ug-result-header">
              <span class="ug-result-song">{{ res.artist_name }} — {{ res.song_name }}</span>
              <span class="ug-result-rating">
                <MdiIcon :path="mdiStar" :size="14" />
                {{ res.rating?.toFixed(1) || '0.0' }} ({{ res.votes || 0 }})
              </span>
            </div>
            <div class="ug-result-meta">
              Type: {{ res.typeLabel || res.type }} | Ver: {{ res.version || 1 }}
            </div>
          </div>
        </div>

        <!-- Preview Column -->
        <div class="ug-preview">
          <div v-if="isPreviewLoading" class="ug-status">Loading chords...</div>
          <div v-else-if="previewParsed" class="ug-preview-content">
            <div class="ug-preview-header">
              <h3>Preview</h3>
              <button class="action-btn ug-import-btn" @click="importChords">
                Use These Chords
              </button>
            </div>
            <div class="ug-preview-chords">
              <div v-if="previewParsed.capo" class="ug-preview-capo">Capo {{ previewParsed.capo }}</div>
              <div v-for="(section, idx) in previewParsed.sections" :key="idx" class="ug-preview-section">
                <strong>[{{ section.section }}]</strong><br/>
                {{ section.chords }}
              </div>
            </div>
          </div>
          <div v-else class="ug-status">
            Select a version to preview
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { mdiClose, mdiMagnify, mdiStar } from '@mdi/js'
import MdiIcon from './MdiIcon.vue'
import { api } from '../api.js'

const props = defineProps({
  initialQuery: { type: String, default: '' }
})

const emit = defineEmits(['close', 'import-chords'])

const inputRef = ref(null)
const searchQuery = ref(props.initialQuery)
const isSearching = ref(false)
const hasSearched = ref(false)
const results = ref([])

const activeTabId = ref(null)
const isPreviewLoading = ref(false)
const previewParsed = ref(null)

onMounted(() => {
  if (searchQuery.value) {
    performSearch()
  } else {
    inputRef.value?.focus()
  }
})

function close() {
  emit('close')
}

function onBackdropClick() {
  close()
}

async function performSearch() {
  const term = searchQuery.value.trim()
  if (!term) return

  isSearching.value = true
  hasSearched.value = true
  results.value = []
  activeTabId.value = null
  previewParsed.value = null

  try {
    const list = await api.ugSearch(term)
    results.value = list.slice(0, 5) // Keep top 5
  } catch (err) {
    console.error('UG Search failed:', err)
  } finally {
    isSearching.value = false
  }
}

async function previewTab(res) {
  if (activeTabId.value === res.id) return
  
  activeTabId.value = res.id
  isPreviewLoading.value = true
  previewParsed.value = null

  try {
    const data = await api.ugGetChords(res.id)
    if (data?.parsed) {
      previewParsed.value = data.parsed
    }
  } catch (err) {
    console.error('UG Fetch failed:', err)
  } finally {
    isPreviewLoading.value = false
  }
}

function importChords() {
  if (previewParsed.value) {
    emit('import-chords', previewParsed.value)
    close()
  }
}
</script>

<style scoped>
.ug-overlay {
  display: flex;
  align-items: center;
  justify-content: center;
}

.ug-panel {
  background: var(--bg-app);
  width: 90vw;
  max-width: 1000px;
  height: 80vh;
  display: flex;
  flex-direction: column;
  padding: 1.5rem;
  overflow: hidden;
}

.ug-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-md);
}

.ug-title {
  margin: 0;
  font-size: var(--font-xl);
  color: var(--text-primary);
}

.ug-search-container {
  display: flex;
  gap: var(--space-sm);
  margin-bottom: var(--space-lg);
}

.ug-search-input {
  flex: 1;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  color: var(--text-primary);
  border-radius: var(--radius-sm);
  padding: var(--space-sm) var(--space-md);
  font-family: inherit;
  font-size: var(--font-md);
}

.ug-search-input:focus {
  border-color: var(--border-light);
  outline: none;
}

.ug-search-btn {
  background: var(--bg-surface);
  color: var(--text-muted);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 0 var(--space-md);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--speed-fast);
}

.ug-search-btn:hover:not(:disabled) {
  background: var(--border);
  color: var(--text-primary);
}

.ug-search-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ug-content {
  display: flex;
  gap: var(--space-lg);
  flex: 1;
  min-height: 0;
}

.ug-results, .ug-preview {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  overflow-y: auto;
  padding: var(--space-md);
  gap: var(--space-sm);
}

.ug-status {
  text-align: center;
  color: var(--text-faint);
  margin-top: 2rem;
  font-size: var(--font-md);
}

.ug-result-card {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: var(--space-md);
  cursor: pointer;
  transition: all var(--speed-fast);
}

.ug-result-card:hover {
  border-color: var(--border-light);
}

.ug-result-card.active {
  border-color: var(--text-primary);
  background: var(--border);
}

.ug-result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-xs);
}

.ug-result-song {
  font-weight: bold;
  color: var(--text-primary);
}

.ug-result-rating {
  font-size: var(--font-sm);
  color: var(--text-muted);
  display: flex;
  align-items: center;
  gap: 4px;
}

.ug-result-meta {
  font-size: var(--font-sm);
  color: var(--text-dim);
}

.ug-preview-content {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.ug-preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-md);
  padding-bottom: var(--space-sm);
  border-bottom: 1px solid var(--border);
}

.ug-preview-header h3 {
  margin: 0;
  color: var(--text-primary);
}

.ug-import-btn {
  background: var(--text-primary);
  color: var(--bg-app);
  padding: var(--space-sm) var(--space-md);
}

.ug-import-btn:hover {
  background: var(--text-muted);
}

.ug-preview-chords {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  color: var(--text-muted);
  font-family: monospace;
  font-size: var(--font-lg);
}

.ug-preview-capo {
  color: var(--text-dim);
  font-style: italic;
}

.ug-preview-section strong {
  color: var(--text-primary);
}
</style>
