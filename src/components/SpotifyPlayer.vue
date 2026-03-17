<template>
  <div class="spotify-player" :class="{ open: visible }">
    <div v-if="spotifyTrackId" class="spotify-embed">
      <iframe
        ref="iframeRef"
        :src="`https://open.spotify.com/embed/track/${spotifyTrackId}?theme=0`"
        width="100%"
        height="80"
        frameborder="0"
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        loading="lazy"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  spotifyTrackId: { type: String, default: null },
})

const iframeRef = ref(null)
// Track whether user has clicked play in the embed.
// When the user clicks inside the iframe, the parent window blurs.
let hasInteracted = false

function onWindowBlur() {
  // If the iframe is the active element, user clicked inside it (e.g. play)
  setTimeout(() => {
    if (document.activeElement === iframeRef.value) {
      hasInteracted = true
    }
  }, 0)
}

onMounted(() => window.addEventListener('blur', onWindowBlur))
onUnmounted(() => window.removeEventListener('blur', onWindowBlur))

// Reset interaction state when track changes (new embed loaded)
watch(() => props.spotifyTrackId, () => {
  hasInteracted = false
})

function pauseIfPlaying() {
  if (hasInteracted && iframeRef.value) {
    iframeRef.value.contentWindow?.postMessage({ command: 'toggle' }, '*')
    hasInteracted = false
  }
}

defineExpose({ pauseIfPlaying })
</script>

<style scoped>
.spotify-player {
  flex-shrink: 0;
  background: var(--bg-app);
  height: 0;
  overflow: hidden;
  transition: height 0.3s ease;
}

.spotify-player.open {
  height: 105px;
  border-top: 1px solid var(--border);
}

.spotify-embed {
  padding: 0.75rem 1.5rem;
}

.spotify-embed iframe {
  display: block;
  border-radius: 8px;
}
</style>
