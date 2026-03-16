<template>
  <div class="overlay-backdrop settings-overlay" @mousedown.self="backdropDown = true" @mouseup.self="onBackdropUp">
    <div class="modal-panel settings-modal">
      <button class="close-btn" @click="$emit('close')" title="Close"><MdiIcon :path="mdiClose" :size="18" /></button>

      <div class="settings-columns">
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
        </div>
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
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import MdiIcon from './MdiIcon.vue'
import { mdiClose } from '@mdi/js'

defineProps({
  defaults: { type: Object, required: true },
  applyStatus: { type: String, default: '' },
  resetChordStatus: { type: String, default: '' },
})

const emit = defineEmits(['save-defaults', 'apply-defaults-to-all', 'reset-all-chords', 'clear-played-status', 'close'])

const backdropDown = ref(false)
const confirmClearChords = ref(false)
let confirmTimer = null

function onBackdropUp() {
  if (backdropDown.value) {
    emit('close')
  }
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
</script>

<style scoped>
.settings-modal {
  padding: 2rem 2rem 1.5rem;
  max-width: 600px;
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

.setting-row:hover {
  color: rgba(255, 255, 255, 0.85);
  background: rgba(255, 255, 255, 0.03);
}

.setting-row input[type="checkbox"] {
  width: 16px;
  height: 16px;
  accent-color: var(--accent);
  cursor: pointer;
}

.apply-all-btn {
  display: block;
  margin-top: var(--space-md);
}

.apply-status {
  display: block;
  margin-top: 0.25rem;
  font-size: var(--font-xs);
  color: var(--accent);
}

.reset-progress {
  margin-top: var(--space-sm);
  height: 4px;
  background: var(--bg-hover);
  border-radius: 2px;
  overflow: hidden;
}

.reset-progress-bar {
  height: 100%;
  background: var(--accent);
  border-radius: 2px;
  transition: width 0.3s ease;
}

.shortcut-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.2rem 0.5rem;
  font-size: var(--font-sm);
  color: rgba(255, 255, 255, 0.45);
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
</style>
