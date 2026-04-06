<template>
  <!-- Top-left: font size controls -->
  <div v-if="page === 'lyrics' && !editingLyrics && hasLyrics" class="top-left-group">
    <button class="edit-action-btn" @click="$emit('adjust-font', -1)" title="Decrease font"><MdiIcon :path="mdiMinus" :size="16" /></button>
    <button class="edit-action-btn" @click="$emit('reset-font')" title="Reset font"><MdiIcon :path="mdiRefresh" :size="16" /></button>
    <button class="edit-action-btn" @click="$emit('adjust-font', 1)" title="Increase font"><MdiIcon :path="mdiPlus" :size="16" /></button>
  </div>

  <!-- Top-right: edit + search + played + label + star + page indicator -->
  <div v-if="page === 'lyrics' && hasTitle" class="top-right-group">
    <template v-if="editingLyrics">
      <button class="edit-action-btn save" @click="$emit('save-edit')" title="Save"><MdiIcon :path="mdiCheck" :size="16" /> Save</button>
      <button class="edit-action-btn cancel" @click="$emit('cancel-edit')" title="Cancel"><MdiIcon :path="mdiClose" :size="16" /> Cancel</button>
    </template>
    <template v-else>
      <button class="edit-action-btn" @click="$emit('enter-edit')" title="Edit lyrics"><MdiIcon :path="mdiPencil" :size="18" /></button>
      <button class="edit-action-btn" @click="$emit('open-library')" title="Search"><MdiIcon :path="mdiMagnify" :size="18" /></button>
      <button
        v-if="isSaved"
        class="edit-action-btn played-btn"
        :class="{ checked: currentPlayed }"
        title="Toggle played"
        @click="$emit('toggle-played')"
      >
        <span class="played-icon-inline" :class="{ checked: currentPlayed }"><MdiIcon :path="mdiCheck" :size="12" /></span>
        <span v-if="currentPlayCount" class="played-count-inline">{{ currentPlayCount }}</span>
      </button>
      <div class="label-wrapper">
        <button
          class="edit-action-btn"
          title="Display Settings"
          @click.stop="showSettingsMenu = !showSettingsMenu; showLabelMenu = false"
        >
          <MdiIcon :path="mdiCog" :size="18" />
        </button>
        <div v-if="showSettingsMenu" ref="settingsMenuRef" class="settings-menu" @click.stop>
          <label class="dropdown-setting">
            <input type="checkbox" :checked="songMerge" @change="$emit('merge-changed', $event.target.checked)" />
            <span>Line merging</span>
          </label>
          <label class="dropdown-setting">
            <input type="checkbox" :checked="songMergeAggressive" @change="$emit('merge-aggressive-changed', $event.target.checked)" />
            <span>Aggressive merging</span>
          </label>
          <label class="dropdown-setting">
            <input type="checkbox" :checked="songCollapseChorus" @change="$emit('collapse-chorus-changed', $event.target.checked)" />
            <span>Collapse repeated sections</span>
          </label>
          <div class="dropdown-divider"></div>
          <label class="dropdown-setting">
            <input type="checkbox" :checked="songSeparators" @change="$emit('separators-changed', $event.target.checked)" />
            <span>Section separators</span>
          </label>
          <label class="dropdown-setting">
            <input type="checkbox" :checked="songAltColors" @change="$emit('alt-colors-changed', $event.target.checked)" />
            <span>Alternating colors</span>
          </label>
        </div>
      </div>
      <div v-if="isSaved" class="label-wrapper">
        <button
          class="edit-action-btn label-circle-btn"
          title="Set label"
          @click.stop="showLabelMenu = !showLabelMenu; showSettingsMenu = false"
        >
          <span class="label-circle" :style="{ background: labelColor }"></span>
        </button>
        <div v-if="showLabelMenu" ref="labelMenuRef" class="label-menu" @click.stop>
          <button
            v-for="opt in labelOptions" :key="opt.value"
            class="label-option"
            :class="{ active: currentLabel === opt.value }"
            :style="{ '--lbl-color': opt.color }"
            @click="$emit('set-label', opt.value); showLabelMenu = false"
          >
            <span class="label-dot" :style="{ background: opt.color }"></span>
            {{ opt.name }}
          </button>
        </div>
      </div>
      <StarButton
        :is-saved="isSaved"
        @toggle="$emit('toggle-star')"
      />
    </template>
    <span
      v-if="!editingLyrics && totalPages > 1"
      class="page-indicator"
    >{{ currentPage }} / {{ totalPages }}</span>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { useEventListener } from '@vueuse/core'
import StarButton from './StarButton.vue'
import MdiIcon from './MdiIcon.vue'
import { mdiMinus, mdiPlus, mdiRefresh, mdiPencil, mdiMagnify, mdiCheck, mdiClose, mdiCog } from '@mdi/js'
import { adjustDropdown } from '../utils/adjustDropdown.js'

const props = defineProps({
  editingLyrics: { type: Boolean, default: false },
  hasLyrics: { type: Boolean, default: false },
  hasTitle: { type: Boolean, default: false },
  page: { type: String, default: 'dashboard' },
  isSaved: { type: Boolean, default: false },
  currentLabel: { type: String, default: null },
  currentPlayed: { type: Boolean, default: false },
  currentPlayCount: { type: Number, default: 0 },
  totalPages: { type: Number, default: 1 },
  currentPage: { type: Number, default: 1 },
  songMerge: { type: Boolean, default: false },
  songMergeAggressive: { type: Boolean, default: false },
  songCollapseChorus: { type: Boolean, default: false },
  songSeparators: { type: Boolean, default: false },
  songAltColors: { type: Boolean, default: true },
})

defineEmits([
  'adjust-font', 'reset-font',
  'save-edit', 'cancel-edit', 'enter-edit',
  'open-library', 'toggle-settings', 'toggle-star',
  'set-label', 'toggle-played',
  'merge-changed', 'merge-aggressive-changed', 'collapse-chorus-changed',
  'separators-changed', 'alt-colors-changed'
])

const showLabelMenu = ref(false)
const labelMenuRef = ref(null)
const showSettingsMenu = ref(false)
const settingsMenuRef = ref(null)

watch(showLabelMenu, (v) => { if (v) adjustDropdown(labelMenuRef) })
watch(showSettingsMenu, (v) => { if (v) adjustDropdown(settingsMenuRef) })

import { LABEL_OPTIONS } from '../constants/labels.js'
const labelOptions = LABEL_OPTIONS

const labelColor = computed(() => {
  const opt = labelOptions.find(o => o.value === props.currentLabel)
  return opt ? opt.color : 'rgba(255,255,255,0.15)'
})

function closeMenus() { 
  showLabelMenu.value = false 
  showSettingsMenu.value = false 
}
useEventListener(document, 'click', closeMenus)
</script>

<style scoped>
.top-right-group {
  position: fixed;
  top: 0;
  right: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  background: var(--bg-surface);
  padding: 0.55rem 1rem 0.55rem 1rem;
  border-bottom-left-radius: 0.625rem;
}

.top-left-group {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  background: var(--bg-surface);
  padding: 0.55rem 1rem;
  border-bottom-right-radius: 0.625rem;
}

.edit-action-btn {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.35);
  font-size: var(--font-md);
  padding: 0.1rem 0.3rem;
  cursor: pointer;
  transition: all var(--speed-fast);
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.edit-action-btn:hover {
  color: var(--accent);
}

.edit-action-btn.save {
  color: var(--color-success);
}

.edit-action-btn.save:hover {
  color: var(--color-success);
}

.edit-action-btn.cancel {
  color: var(--text-dim);
}

.edit-action-btn.cancel:hover {
  color: var(--color-danger);
}

.page-indicator {
  font-size: var(--font-sm);
  color: rgba(255, 255, 255, 0.4);
  letter-spacing: 0.08em;
  user-select: none;
}

.label-wrapper {
  position: relative;
}

.label-circle-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.15rem !important;
}

.label-circle {
  width: 0.75rem;
  height: 0.75rem;
  border-radius: 50%;
  border: 1.5px solid rgba(255,255,255,0.15);
  transition: background var(--speed-normal);
}

.label-menu {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: var(--space-xs);
  background: rgba(30, 30, 30, 0.95);
  backdrop-filter: blur(10px);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  padding: var(--space-xs);
  min-width: 10rem;
  z-index: 200;
}

.settings-menu {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: var(--space-xs);
  background: rgba(30, 30, 30, 0.95);
  backdrop-filter: blur(10px);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  padding: var(--space-sm);
  min-width: 14rem;
  z-index: 200;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.dropdown-setting {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: var(--font-sm);
  color: var(--text-primary);
  cursor: pointer;
  white-space: nowrap;
}

.dropdown-setting input[type="checkbox"] {
  cursor: pointer;
}

.dropdown-divider {
  height: 1px;
  background: var(--border-light);
  margin: 0.25rem 0;
}

.disabled-text {
  opacity: 0.5;
}

.label-option {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  width: 100%;
  background: none;
  border: none;
  color: rgba(255,255,255,0.7);
  padding: 0.4rem 0.6rem;
  border-radius: 0.3125rem;
  cursor: pointer;
  font-size: var(--font-sm);
  white-space: nowrap;
}

.label-option:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.label-option.active {
  color: var(--lbl-color, var(--color-success));
  font-weight: 600;
}

.label-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  flex-shrink: 0;
}

.played-btn {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.played-icon-inline {
  width: 1rem;
  height: 1rem;
  border: 1.5px solid var(--border-light);
  border-radius: 0.1875rem;
  display: flex;
  align-items: center;
  justify-content: center;
  color: transparent;
  transition: all var(--speed-fast);
}

.played-icon-inline.checked {
  color: var(--color-success);
  border-color: rgba(46, 204, 113, 0.4);
  background: rgba(46, 204, 113, 0.1);
}

.played-count-inline {
  font-size: var(--font-sm);
  color: var(--text-dim);
  line-height: 1;
}
</style>
