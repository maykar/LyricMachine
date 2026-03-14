<template>
  <div class="chord-drawer">
    <!-- Top-right controls -->
    <div v-if="!loading" class="chord-top-controls">
      <template v-if="editing">
        <button class="chord-icon-btn save" @click="saveEdits" title="Save"><MdiIcon :path="mdiCheck" :size="16" /></button>
        <button class="chord-icon-btn cancel" @click="editing = false" title="Cancel"><MdiIcon :path="mdiClose" :size="16" /></button>
      </template>
      <template v-else>
        <button v-if="found && sections.length" class="chord-icon-btn" @click="transposeAll(-1)" title="Transpose down"><MdiIcon :path="mdiChevronLeft" :size="16" /></button>
        <button v-if="found && sections.length" class="chord-icon-btn reset" @click="resetTranspose" title="Reset"><MdiIcon :path="mdiRefresh" :size="16" /></button>
        <button v-if="found && sections.length" class="chord-icon-btn" @click="transposeAll(1)" title="Transpose up"><MdiIcon :path="mdiChevronRight" :size="16" /></button>
        <button class="chord-icon-btn" @click="startEditing" title="Edit chords"><MdiIcon :path="mdiPencil" :size="16" /></button>
        <button class="chord-text-btn" @click="$emit('reset-chords')" title="Reset to original">Reset</button>
      </template>
    </div>

    <div v-if="loading" class="chord-status">Searching…</div>
    <div v-else-if="!found && !editing" class="chord-status">No chords found</div>
    <template v-else>
      <!-- Display mode -->
      <template v-if="!editing">
        <div v-if="capo" class="chord-status" style="margin-bottom: 0.4rem;">Capo: fret {{ capo }}</div>
        <div v-if="structure" class="chord-structure">{{ formatStructure(structure) }}</div>
        <div v-if="sections.length" class="chord-sections">
          <div v-for="(s, i) in sections" :key="i" class="chord-section">
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
</template>

<script setup>
import { ref } from 'vue'
import MdiIcon from './MdiIcon.vue'
import {
  mdiCheck, mdiClose, mdiChevronLeft, mdiChevronRight,
  mdiRefresh, mdiPencil, mdiPlus,
} from '@mdi/js'

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const FLAT_MAP = { 'Db': 'C#', 'Eb': 'D#', 'Fb': 'E', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#', 'Cb': 'B' }

const props = defineProps({
  loading: { type: Boolean, default: false },
  found: { type: Boolean, default: false },
  sections: { type: Array, default: () => [] },
  structure: { type: String, default: '' },
  capo: { type: Number, default: null },
  hasCustomChords: { type: Boolean, default: false },
})

const emit = defineEmits(['update:chords', 'reset-chords'])

const editing = ref(false)
const editSections = ref([])
const editStructure = ref('')
const transposeOffset = ref(0)
const originalSections = ref([])

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

  // Extract root and suffix — handle #, b, and s notations for sharps
  const match = note.match(/^([A-G][#bs]?)(.*)$/)
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

function transposeAll(semitones) {
  // Snapshot original chords on first transpose
  if (transposeOffset.value === 0) {
    originalSections.value = props.sections.map(s => ({ ...s }))
  }
  transposeOffset.value += semitones
  const transposed = props.sections.map(s => ({
    section: s.section,
    chords: transposeChordsString(s.chords, semitones),
  }))
  emit('update:chords', {
    sections: transposed,
    structure: props.structure,
  })
}

function resetTranspose() {
  if (originalSections.value.length) {
    emit('update:chords', {
      sections: originalSections.value.map(s => ({ ...s })),
      structure: props.structure,
    })
  }
  transposeOffset.value = 0
  originalSections.value = []
}
</script>

<style scoped>
.chord-drawer {
  flex-shrink: 0;
  background: #0d0d0d;
  border-top: 1px solid #222;
  padding: 1rem 1.5rem 1.25rem;
  max-height: 35vh;
  min-height: 2.5rem;
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
  font-size: 0.85rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #f5c542;
}

.chord-status {
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.3);
}

.chord-structure {
  font-size: 1rem;
  color: rgba(255, 255, 255, 0.4);
  letter-spacing: 0.03em;
  padding-bottom: 0.6rem;
  margin-bottom: 0.4rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
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
  gap: 0.4rem;
  z-index: 1;
}

.chord-icon-btn {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.3);
  font-size: 0.9rem;
  cursor: pointer;
  transition: color 0.15s;
  padding: 0;
}

.chord-icon-btn:hover {
  color: #f5c542;
}

.chord-icon-btn.save {
  color: rgba(46, 204, 113, 0.6);
}

.chord-icon-btn.save:hover {
  color: #2ecc71;
}

.chord-icon-btn.cancel:hover {
  color: #e74c3c;
}

.chord-text-btn {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.3);
  font-size: 0.65rem;
  cursor: pointer;
  transition: color 0.15s;
  padding: 0;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.chord-text-btn:hover {
  color: #f5c542;
}

.chord-structure-input {
  flex: 1;
  background: #0a0a0a;
  border: 1px solid #2a2a2a;
  border-radius: 4px;
  padding: 0.2rem 0.5rem;
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.6);
  outline: none;
}

.chord-structure-input:focus {
  border-color: #f5c542;
}

.chord-edit-sections {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  padding: 0.3rem 0.5rem;
}

.chord-edit-row {
  display: flex;
  gap: 0.4rem;
  align-items: center;
}

.chord-edit-name {
  width: 110px;
  background: #0a0a0a;
  border: 1px solid #2a2a2a;
  border-radius: 4px;
  padding: 0.2rem 0.4rem;
  font-size: 0.8rem;
  font-weight: 600;
  color: #f5c542;
  outline: none;
  cursor: pointer;
}

.chord-edit-name:focus {
  border-color: #f5c542;
}

.chord-edit-chords {
  flex: 1;
  background: #0a0a0a;
  border: 1px solid #2a2a2a;
  border-radius: 4px;
  padding: 0.2rem 0.4rem;
  font-size: 0.85rem;
  color: #ddd;
  outline: none;
}

.chord-edit-chords:focus {
  border-color: #f5c542;
}

.chord-remove-btn {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.2);
  font-size: 0.8rem;
  cursor: pointer;
  padding: 0.1rem 0.3rem;
}

.chord-remove-btn:hover {
  color: #e74c3c;
}

.chord-add-btn {
  align-self: flex-start;
  background: none;
  border: 1px dashed rgba(255, 255, 255, 0.15);
  border-radius: 4px;
  color: rgba(255, 255, 255, 0.3);
  font-size: 0.75rem;
  padding: 0.2rem 0.6rem;
  cursor: pointer;
  margin-top: 0.2rem;
}

.chord-add-btn:hover {
  color: #f5c542;
  border-color: rgba(245, 197, 66, 0.3);
}
</style>
