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
import { ref } from 'vue'

defineProps({
  visible: { type: Boolean, default: false },
  spotifyTrackId: { type: String, default: null },
})

const iframeRef = ref(null)

function pause() {
  if (iframeRef.value) {
    iframeRef.value.contentWindow?.postMessage({ command: 'toggle' }, '*')
  }
}

defineExpose({ pause })
</script>

<style scoped>
.spotify-player {
  flex-shrink: 0;
  background: var(--bg-app);
  border-top: 1px solid var(--border);
  height: 0;
  overflow: hidden;
  transition: height 0.3s ease;
}

.spotify-player.open {
  height: 105px;
}

.spotify-embed {
  padding: 0.75rem 1.5rem;
}

.spotify-embed iframe {
  display: block;
  border-radius: 8px;
}
</style>
