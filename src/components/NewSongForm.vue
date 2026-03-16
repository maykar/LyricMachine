<template>
  <div v-if="visible" class="settings-panel">
    <div class="new-song-form">
      <div class="new-song-row">
        <input v-model="newArtist" class="new-song-input" placeholder="Artist" @keydown.enter="trackInput?.focus()" />
        <input ref="trackInput" v-model="newTrack" class="new-song-input" placeholder="Track" @keydown.enter="lyricsInput?.focus()" />
      </div>
      <textarea ref="lyricsInput" v-model="newLyrics" class="new-song-lyrics" placeholder="Paste or type lyrics here…" rows="6"></textarea>
      <button class="new-song-submit" :disabled="!newArtist.trim() || !newTrack.trim()" @click="submit">Create Song</button>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

defineProps({
  visible: { type: Boolean, default: false },
})

const emit = defineEmits(['created'])

const newArtist = ref('')
const newTrack = ref('')
const newLyrics = ref('')
const trackInput = ref(null)
const lyricsInput = ref(null)

function submit() {
  const artist = newArtist.value.trim()
  const track = newTrack.value.trim()
  if (!artist || !track) return

  const title = `${artist} — ${track}`
  const lyrics = newLyrics.value || ''

  emit('created', { title, lyrics })

  newArtist.value = ''
  newTrack.value = ''
  newLyrics.value = ''
}
</script>

<style scoped>
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
  padding: 0.5rem 0.75rem;
  font-size: var(--font-md);
  font-family: inherit;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: var(--radius-xs);
  color: var(--text-primary);
  outline: none;
}

.new-song-input:focus {
  border-color: var(--accent);
}

.new-song-lyrics {
  width: 100%;
  padding: 0.5rem 0.75rem;
  font-size: var(--font-sm);
  font-family: inherit;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: var(--radius-xs);
  color: var(--text-primary);
  outline: none;
  resize: vertical;
}

.new-song-lyrics:focus {
  border-color: var(--accent);
}

.new-song-submit {
  padding: 0.5rem 1rem;
  font-size: var(--font-sm);
  font-family: inherit;
  background: var(--accent-15);
  border: 1px solid var(--accent-30);
  border-radius: var(--radius-xs);
  color: var(--accent);
  cursor: pointer;
  transition: background var(--speed-fast);
}

.new-song-submit:hover {
  background: var(--accent-25);
}

.new-song-submit:disabled {
  opacity: 0.3;
  cursor: default;
}
</style>
