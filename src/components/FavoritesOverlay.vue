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
          :key="fav.id || i"
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
import { ref } from 'vue'
import { useFavorites } from '../composables/useFavorites.js'
import { api } from '../api.js'

const emit = defineEmits(['close', 'select', 'updated'])

const { favorites } = useFavorites()
const fileInput = ref(null)

async function removeFavorite(index) {
  const fav = favorites.value[index]
  favorites.value.splice(index, 1)
  if (fav && fav.id) {
    await api.deleteSong(fav.id)
  }
  emit('updated')
}

function exportFavorites() {
  const a = document.createElement('a')
  a.href = '/api/export'
  a.download = 'lyricmachine-favorites.json'
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
</script>
