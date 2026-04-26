<template>
  <div class="chord-drawer">
    <!-- Top-right controls -->
    <div v-if="!loading" class="chord-top-controls">
      <template v-if="editing">
        <button class="chord-icon-btn save" @click="saveEdits" title="Save"><MdiIcon :path="mdiCheck" :size="16" /></button>
        <button class="chord-icon-btn cancel" @click="editing = false" title="Cancel"><MdiIcon :path="mdiClose" :size="16" /></button>
      </template>
      <template v-else>
        <button v-if="found && sections.length" class="chord-icon-btn" @click="changeTranspose(-1)" title="Transpose down"><MdiIcon :path="mdiChevronLeft" :size="16" /></button>
        <button v-if="found && sections.length" class="chord-icon-btn reset" @click="resetTranspose" title="Reset transpose"><MdiIcon :path="mdiRefresh" :size="16" /></button>
        <button v-if="found && sections.length" class="chord-icon-btn" @click="changeTranspose(1)" title="Transpose up"><MdiIcon :path="mdiChevronRight" :size="16" /></button>
        <button class="chord-icon-btn" @click="startEditing" title="Edit chords"><MdiIcon :path="mdiPencil" :size="16" /></button>
        <button class="chord-icon-btn" @click="openUGSearch" title="Search Ultimate Guitar"><MdiIcon :path="mdiMagnify" :size="16" /></button>
        <button class="chord-icon-btn cancel" @click="$emit('reset-chords')" title="Clear custom chords"><MdiIcon :path="mdiDelete" :size="16" /></button>
      </template>
    </div>

    <div v-if="loading" class="chord-status">Searching…</div>
    <div v-else-if="!found && !editing" class="chord-status">No chords found</div>
    <template v-else>
      <!-- Display mode -->
      <template v-if="!editing">
        <div v-if="capo" class="chord-status" style="margin-bottom: 0.4rem;">Capo: fret {{ capo }}</div>
        <div v-if="tonalityName" class="chord-status" style="margin-bottom: 0.4rem;">Key: {{ tonalityName }}</div>
        <div v-if="tuning" class="chord-status" style="margin-bottom: 0.4rem;">Tuning: {{ tuning }}</div>
        <div v-if="structure" class="chord-structure">{{ formatStructure(structure) }}</div>
        <div v-if="displaySections.length" class="chord-sections">
          <div v-for="(s, i) in displaySections" :key="i" class="chord-section">
            <span class="chord-section-name">{{ s.section }}</span>
            <span class="chord-section-chords">{{ s.chords }}</span>
          </div>
        </div>
      </template>

      <!-- Edit mode -->
      <template v-if="editing">
        <input v-model="editStructure" class="chord-structure-input" placeholder="IN → V1 → CH → V2 → CH → OUT" />
        <div class="chord-sections chord-edit-sections">
          <div v-for="(s, i) in editSections" :key="i" class="chord-edit-row">
            <select v-model="s.section" class="chord-edit-name">
              <option value="INTRO">INTRO</option>
              <option value="PRE-VERSE">PRE-VERSE</option>
              <option value="VERSE">VERSE</option>
              <option value="PRE-CHORUS">PRE-CHORUS</option>
              <option value="CHORUS">CHORUS</option>
              <option value="POST-CHORUS">POST-CHORUS</option>
              <option value="BRIDGE">BRIDGE</option>
              <option value="SOLO">SOLO</option>
              <option value="INTERLUDE">INTERLUDE</option>
              <option value="INSTRUMENTAL">INSTRUMENTAL</option>
              <option value="OUTRO">OUTRO</option>
            </select>
            <input v-model="s.chords" class="chord-edit-chords" placeholder="G Am C D" />
            <button class="chord-remove-btn" @click="editSections.splice(i, 1)" title="Remove"><MdiIcon :path="mdiClose" :size="14" /></button>
          </div>
          <button class="chord-add-btn" @click="editSections.push({ section: 'VERSE', chords: '' })"><MdiIcon :path="mdiPlus" :size="14" /> Add Section</button>
        </div>
      </template>
    </template>
  </div>

  <UGSearchOverlay 
    v-if="showUGSearch" 
    :initial-query="currentTitle"
    @import-chords="onImportChords"
    @close="showUGSearch = false" 
  />
</template>

<script setup>
import { ref, computed } from 'vue'
import { api } from '../api.js'
import { useFavoritesStore } from '../stores/favorites.js'
import MdiIcon from './MdiIcon.vue'
import UGSearchOverlay from './UGSearchOverlay.vue'
import {
  mdiCheck, mdiClose, mdiChevronLeft, mdiChevronRight,
  mdiRefresh, mdiPencil, mdiPlus, mdiMagnify, mdiDelete
} from '@mdi/js'

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const FLAT_MAP = { 'Db': 'C#', 'Eb': 'D#', 'Fb': 'E', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#', 'Cb': 'B' }

const props = defineProps({
  loading: { type: Boolean, default: false },
  found: { type: Boolean, default: false },
  sections: { type: Array, default: () => [] },
  structure: { type: String, default: '' },
  capo: { type: Number, default: null },
  tonalityName: { type: String, default: null },
  tuning: { type: String, default: null },
  hasCustomChords: { type: Boolean, default: false },
  transpose: { type: Number, default: 0 },
})

const emit = defineEmits(['update:chords', 'reset-chords', 'change-transpose'])

const editing = ref(false)
const editSections = ref([])
const editStructure = ref('')

const showUGSearch = ref(false)

const currentTitle = computed(() => {
  return useFavoritesStore().currentTitle || ''
})

const displaySections = computed(() => {
  if (!props.transpose) return props.sections
  return props.sections.map(s => ({
    section: s.section,
    chords: transposeChordsString(s.chords, props.transpose),
  }))
})

function startEditing() {
  editSections.value = props.sections.length
    ? props.sections.map(s => ({ ...s }))
    : [{ section: 'VERSE', chords: '' }, { section: 'CHORUS', chords: '' }]
  editStructure.value = props.structure || ''
  editing.value = true
}

function formatChords(raw) {
  if (raw.includes('·')) return raw.trim()
  return raw.trim().split(/\s*[,\-]\s*|\s+/).join(' · ')
}

function formatStructure(raw) {
  const EXPAND = {
    'IN': 'INTRO', 'INT': 'INTRO',
    'V': 'VERSE', 'VER': 'VERSE',
    'PV': 'PRE-VERSE',
    'PC': 'PRE-CHORUS',
    'CH': 'CHORUS', 'CHO': 'CHORUS',
    'PCH': 'POST-CHORUS',
    'B': 'BRIDGE', 'BR': 'BRIDGE',
    'S': 'SOLO',
    'IL': 'INTERLUDE',
    'INS': 'INSTRUMENTAL', 'INST': 'INSTRUMENTAL',
    'OUT': 'OUTRO',
    'GUI': 'GUITAR',
    'LIN': 'LINK',
    'TAB': 'TAB',
  }
  return raw.trim()
    .split(/\s*[→>]\s*/)
    .map(s => {
      const upper = s.trim().toUpperCase()
      return EXPAND[upper] || upper
    })
    .join(' → ')
}

function saveEdits() {
  const cleaned = editSections.value
    .filter(s => s.section.trim() || s.chords.trim())
    .map(s => ({ section: s.section.trim().toUpperCase(), chords: formatChords(s.chords) }))
  emit('update:chords', {
    sections: cleaned,
    structure: formatStructure(editStructure.value),
    capo: props.capo,
    tonalityName: props.tonalityName,
    tuning: props.tuning
  })
  editing.value = false
}

// --- Transpose ---
function transposeNote(note, semitones) {
  // Handle slash chords: transpose both parts (e.g., G/B → G#/C)
  if (note.includes('/')) {
    const [main, bass] = note.split('/')
    return transposeNote(main, semitones) + '/' + transposeNote(bass, semitones)
  }

  // Extract root and suffix — handle #, b, and s notations for sharps.
  // The 's' sharp suffix (e.g. Cs, Ds from UG) must NOT match the 's' in 'sus4'/'sus2',
  // so we use a negative lookahead: 's' only if not followed by a vowel.
  const match = note.match(/^([A-G](?:[#b]|s(?![aeiou]))?)(.*)/)
  if (!match) return note

  let root = match[1]
  const suffix = match[2]

  // Normalize flats and 's' sharps to '#'
  if (FLAT_MAP[root]) root = FLAT_MAP[root]
  if (root.length === 2 && root[1] === 's') root = root[0] + '#'

  const idx = NOTES.indexOf(root)
  if (idx < 0) return note

  const newIdx = ((idx + semitones) % 12 + 12) % 12
  return NOTES[newIdx] + suffix
}

function transposeChordsString(chordsStr, semitones) {
  // Split by · separator, transpose each chord token
  return chordsStr.split(' · ').map(chord => {
    // Each "chord" might have spaces (shouldn't normally), but handle it
    return chord.trim().split(/\s+/).map(token => transposeNote(token, semitones)).join(' ')
  }).join(' · ')
}

function changeTranspose(semitones) {
  emit('change-transpose', semitones)
}

function resetTranspose() {
  emit('change-transpose', -props.transpose)
}

function openUGSearch() {
  showUGSearch.value = true
}

function onImportChords(parsedData) {
  emit('update:chords', {
    sections: parsedData.sections,
    structure: parsedData.structure || '',
    capo: parsedData.capo || null,
    tonalityName: parsedData.tonalityName || null,
    tuning: parsedData.tuning || null
  })
}
</script>

<style scoped>
.chord-drawer {
  flex-shrink: 0;
  background: var(--bg-app);
  border-top: 1px solid var(--border);
  padding: 1rem 1.5rem 1.25rem;
  max-height: 35vh;
  overflow-y: auto;
  position: relative;
}

.chord-drawer::-webkit-scrollbar {
  width: 4px;
}

.chord-drawer::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
}

.chord-drawer-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.6rem;
}

.chord-drawer-title {
  font-size: var(--font-sm);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--accent);
}

.chord-status {
  font-size: var(--font-sm);
  color: var(--text-dim);
}

.chord-structure {
  font-size: var(--font-lg);
  color: rgba(255, 255, 255, 0.4);
  letter-spacing: 0.03em;
  padding-bottom: 0.6rem;
  margin-bottom: var(--space-sm);
  border-bottom: 1px solid var(--bg-hover);
}

.chord-sections {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem 2rem;
}

.chord-section {
  display: flex;
  align-items: baseline;
  gap: 0.6rem;
}

.chord-section-name {
  font-size: 1.1rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgba(255, 255, 255, 0.35);
  white-space: nowrap;
}

.chord-section-chords {
  font-size: 1.35rem;
  color: rgba(250, 240, 200, 0.85);
  letter-spacing: 0.02em;
}

.chord-top-controls {
  position: absolute;
  top: 0.5rem;
  right: 0.75rem;
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  z-index: 1;
}

.chord-icon-btn {
  background: none;
  border: none;
  color: var(--text-dim);
  font-size: var(--font-md);
  cursor: pointer;
  transition: color var(--speed-fast);
  padding: 0;
}

.chord-icon-btn:hover {
  color: var(--accent);
}

.chord-icon-btn.save {
  color: rgba(46, 204, 113, 0.6);
}

.chord-icon-btn.save:hover {
  color: var(--color-success);
}

.chord-icon-btn.cancel:hover {
  color: var(--color-danger);
}

.chord-text-btn {
  background: none;
  border: none;
  color: var(--text-dim);
  font-size: 0.65rem;
  cursor: pointer;
  transition: color var(--speed-fast);
  padding: 0;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.chord-text-btn:hover {
  color: var(--accent);
}

.chord-structure-input {
  flex: 1;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: var(--radius-xs);
  padding: 0.2rem 0.5rem;
  font-size: var(--font-sm);
  color: var(--text-muted);
  outline: none;
}

.chord-structure-input:focus {
  border-color: var(--accent);
}

.chord-edit-sections {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  padding: var(--space-xs) 0.5rem;
}

.chord-edit-row {
  display: flex;
  gap: var(--space-sm);
  align-items: center;
}

.chord-edit-name {
  width: 6.875rem;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: var(--radius-xs);
  padding: 0.2rem 0.4rem;
  font-size: var(--font-sm);
  font-weight: 600;
  color: var(--accent);
  outline: none;
  cursor: pointer;
}

.chord-edit-name:focus {
  border-color: var(--accent);
}

.chord-edit-chords {
  flex: 1;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: var(--radius-xs);
  padding: 0.2rem 0.4rem;
  font-size: var(--font-sm);
  color: var(--text-primary);
  outline: none;
}

.chord-edit-chords:focus {
  border-color: var(--accent);
}

.chord-remove-btn {
  background: none;
  border: none;
  color: var(--text-faint);
  font-size: var(--font-sm);
  cursor: pointer;
  padding: 0.1rem 0.3rem;
}

.chord-remove-btn:hover {
  color: var(--color-danger);
}

.chord-add-btn {
  align-self: flex-start;
  background: none;
  border: 1px dashed rgba(255, 255, 255, 0.15);
  border-radius: var(--radius-xs);
  color: var(--text-dim);
  font-size: var(--font-xs);
  padding: 0.2rem 0.6rem;
  cursor: pointer;
  margin-top: 0.2rem;
}

.chord-add-btn:hover {
  color: var(--accent);
  border-color: var(--accent-30);
}
</style>
