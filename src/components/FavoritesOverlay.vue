<template>
  <div class="overlay-backdrop favorites-overlay" @click.self="$emit('close')">
    <div class="favorites-panel">
      <div class="favorites-header">
        <h2>Favorites</h2>
        <div class="favorites-actions">
          <button class="action-btn" @click="exportFavorites" title="Download favorites">
            ↓ Export
          </button>
          <button class="action-btn" @click="triggerImport" title="Load favorites from file">
            ↑ Import
          </button>
        </div>
      </div>

      <div class="favorites-list" v-if="favorites.length">
        <div
          v-for="(fav, i) in favorites"
          :key="i"
          class="favorite-item"
          @click="$emit('select', fav)"
        >
          <span class="title">{{ fav.title }}</span>
          <button
            class="delete-btn"
            title="Remove"
            @click.stop="removeFavorite(i)"
          >✕</button>
        </div>
      </div>

      <div v-else class="empty-favorites">
        No saved favorites yet.<br />Star a song to save it here.
      </div>

      <input
        ref="fileInput"
        type="file"
        accept=".json"
        style="display: none"
        @change="importFavorites"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const STORAGE_KEY = 'lyricmachine_favorites'

const emit = defineEmits(['close', 'select', 'updated'])

const favorites = ref([])
const fileInput = ref(null)

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
}

function exportFavorites() {
  const blob = new Blob([JSON.stringify(favorites.value, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'lyricmachine-favorites.json'
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

      // Merge: add items that don't already exist by title
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
  // Reset input so re-importing the same file works
  e.target.value = ''
}

onMounted(loadFavorites)
</script>
