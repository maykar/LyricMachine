<template>
  <div
    v-if="show"
    class="ctx-menu"
    :style="{ top: y + 'px', left: x + 'px' }"
    @click.stop
  >
    <button
      v-for="opt in LABEL_OPTIONS" :key="opt.value"
      class="ctx-option"
      :class="{ active: fav?.label === opt.value }"
      @click="$emit('set-label', opt.value)"
    >
      <span class="ctx-dot" :style="{ background: opt.color }"></span>
      {{ opt.name }}
    </button>
    <div class="ctx-divider"></div>
    <button class="ctx-option" @click="$emit('toggle-played')">
      <MdiIcon :path="mdiCheck" :size="14" /> Played{{ fav?.playCount ? ` (${fav.playCount})` : '' }}
    </button>
    <button class="ctx-option" @click="$emit('edit-count')">
      <MdiIcon :path="mdiPencil" :size="14" /> Edit Count
    </button>
    <button class="ctx-option" @click="$emit('clear-count')">
      <MdiIcon :path="mdiRefresh" :size="14" /> Clear Count
    </button>
    <div class="ctx-divider"></div>
    <button class="ctx-option ctx-delete" @click="$emit('delete')">
      <MdiIcon :path="mdiDelete" :size="14" /> Remove
    </button>
    <template v-if="fav?.notInPlaylist">
      <div class="ctx-divider"></div>
      <button class="ctx-option" @click="$emit('add-to-source')">
        <MdiIcon :path="mdiPlaylistPlus" :size="14" /> Add to source playlist
      </button>
    </template>
  </div>
</template>

<script setup>
import MdiIcon from './MdiIcon.vue'
import { mdiCheck, mdiPencil, mdiRefresh, mdiDelete, mdiPlaylistPlus } from '@mdi/js'
import { LABEL_OPTIONS } from '../constants/labels.js'

defineProps({
  show: { type: Boolean, default: false },
  x: { type: Number, default: 0 },
  y: { type: Number, default: 0 },
  fav: { type: Object, default: null },
})

defineEmits(['set-label', 'toggle-played', 'edit-count', 'clear-count', 'delete', 'add-to-source', 'close'])
</script>

<style scoped>
.ctx-menu {
  position: fixed;
  z-index: 300;
  background: var(--bg-surface);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  padding: var(--space-xs) 0;
  min-width: 170px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
}

.ctx-option {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  width: 100%;
  background: none;
  border: none;
  color: var(--text-muted);
  padding: 0.45rem 1rem;
  cursor: pointer;
  font-size: var(--font-sm);
  font-family: inherit;
  transition: background var(--speed-fast);
}

.ctx-option:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
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

.ctx-delete:hover {
  color: var(--color-danger);
}
</style>
