<template>
  <div class="overlay-backdrop settings-overlay" @mousedown.self="backdropDown = true" @mouseup.self="onBackdropUp">
    <div class="settings-modal">
      <button class="settings-close" @click="$emit('close')" title="Close"><MdiIcon :path="mdiClose" :size="18" /></button>

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
          <button class="apply-all-btn" @click="$emit('apply-defaults-to-all')">Apply defaults to all</button>
          <span v-if="applyStatus" class="apply-status">{{ applyStatus }}</span>
          <button class="apply-all-btn danger" @click="onClearChords">
            {{ confirmClearChords ? 'Are you sure?' : 'Clear all chords' }}
          </button>
          <span v-if="resetChordStatus" class="apply-status">{{ resetChordStatus }}</span>
          <button class="apply-all-btn" @click="$emit('clear-played-status')">Clear played status</button>
          <button class="apply-all-btn" @click="openBookmarklet">UG Import bookmarklet</button>
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
  background: #111;
  border: 1px solid #222;
  border-radius: 16px;
  padding: 2rem 2rem 1.5rem;
  position: relative;
  max-width: 600px;
  width: 90vw;
}

.settings-overlay {
  z-index: 300;
}

.settings-close {
  position: absolute;
  top: 0.75rem;
  right: 1rem;
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.2);
  font-size: 1.1rem;
  cursor: pointer;
  padding: 0.2rem 0.5rem;
  transition: color 0.15s;
}

.settings-close:hover {
  color: rgba(255, 255, 255, 0.6);
}

.settings-columns {
  display: flex;
  gap: 2rem;
}

.settings-col {
  flex: 1;
}

.settings-section-title {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(255, 255, 255, 0.3);
  padding: 0.25rem 0.5rem;
  margin-bottom: 0.15rem;
}

.setting-row {
  display: flex;
  flex-direction: row-reverse;
  justify-content: flex-end;
  align-items: center;
  gap: 0.5rem;
  padding: 0.3rem 0.5rem;
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  border-radius: 4px;
}

.setting-row:hover {
  color: rgba(255, 255, 255, 0.85);
  background: rgba(255, 255, 255, 0.03);
}

.setting-row input[type="checkbox"] {
  width: 16px;
  height: 16px;
  accent-color: #f5c542;
  cursor: pointer;
}

.apply-all-btn {
  display: block;
  margin-top: 0.5rem;
  padding: 0.3rem 0.75rem;
  font-size: 0.75rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid #2a2a2a;
  border-radius: 4px;
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  transition: all 0.15s;
}

.apply-all-btn:hover {
  background: rgba(245, 197, 66, 0.1);
  border-color: #f5c542;
  color: #f5c542;
}

.apply-all-btn.danger:hover {
  background: rgba(231, 76, 60, 0.1);
  border-color: #e74c3c;
  color: #e74c3c;
}

.apply-all-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.apply-status {
  display: block;
  margin-top: 0.25rem;
  font-size: 0.7rem;
  color: #f5c542;
}

.reset-progress {
  margin-top: 0.4rem;
  height: 4px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 2px;
  overflow: hidden;
}

.reset-progress-bar {
  height: 100%;
  background: #f5c542;
  border-radius: 2px;
  transition: width 0.3s ease;
}

.shortcut-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.2rem 0.5rem;
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.45);
}

.shortcut-row kbd {
  display: inline-block;
  min-width: 2rem;
  text-align: center;
  padding: 0.1rem 0.4rem;
  font-size: 0.75rem;
  font-family: inherit;
  background: #1a1a1a;
  border: 1px solid #2a2a2a;
  border-radius: 4px;
  color: rgba(255, 255, 255, 0.5);
}
</style>
