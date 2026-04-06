<template>
  <div class="overlay-backdrop search-overlay" @click.self="$emit('close')">
    <div class="search-box">
      <input
        ref="inputRef"
        v-model="query"
        class="search-input"
        type="text"
        placeholder="Search for a song…"
        @keydown.enter="handleSearch"
        @keydown.escape="$emit('close')"
      />
      <div class="search-status">{{ statusText }}</div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const emit = defineEmits(['close', 'select'])

const query = ref('')
const inputRef = ref(null)
const statusText = ref('Type a song name and press Enter')

onMounted(() => {
  inputRef.value?.focus()
})

async function handleSearch() {
  const term = query.value.trim()
  if (!term) return

  statusText.value = 'Searching…'

  try {
    const res = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(term)}`)
    if (!res.ok) throw new Error('API error')

    const data = await res.json()
    const match = data.find(item => item.plainLyrics)

    if (match) {
      const title = [match.artistName, match.trackName].filter(Boolean).join(' — ')
      emit('select', { title, lyrics: match.plainLyrics, syncedLyrics: match.syncedLyrics || null })
      statusText.value = ''
      query.value = ''
    } else {
      statusText.value = 'No lyrics found — try a different search'
    }
  } catch {
    statusText.value = 'Search failed — check your connection'
  }
}
</script>
