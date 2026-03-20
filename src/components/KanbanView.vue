<template>
  <div class="overlay-backdrop kanban-backdrop" @mousedown.self="backdropDown = true" @mouseup.self="onBackdropUp">
    <div class="modal-panel kanban-panel">
      <button class="close-btn close-btn--danger" @click="$emit('close')" title="Close"><MdiIcon :path="mdiClose" :size="18" /></button>
      <h2 class="kanban-title" data-text="KANBAN!" @click="sayKanban">KANBAN!</h2>

      <div class="kanban-columns">
        <div
          v-for="col in columns" :key="col.value"
          class="kanban-col"
          :style="{ '--col-color': col.color }"
          @dragover.prevent="onDragOver(col.value)"
          @dragleave="dragOverCol = null"
          @drop.prevent="onDrop(col.value)"
          :class="{ 'drag-target': dragOverCol === col.value }"
        >
          <div class="kanban-col-header">
            <span class="kanban-col-dot" :style="{ background: col.color }"></span>
            {{ col.name }}
            <span class="kanban-col-count">{{ columnItems(col.value).length }}</span>
          </div>
          <div class="kanban-col-body">
            <div
              v-for="item in columnItems(col.value)" :key="item.title"
              class="kanban-card"
              draggable="true"
              @dragstart="onDragStart(item, $event)"
              @dragend="onDragEnd"
            >
              <span class="kanban-card-artist text-truncate">{{ splitTitle(item.title).artist }}</span>
              <span class="kanban-card-track text-truncate">{{ splitTitle(item.title).track }}</span>
            </div>
            <div v-if="!columnItems(col.value).length" class="kanban-empty">
              No songs
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Confetti canvas -->
    <canvas ref="confettiCanvas" class="confetti-canvas"></canvas>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import confettiModule from 'canvas-confetti'
import MdiIcon from './MdiIcon.vue'
import { mdiClose } from '@mdi/js'

import { splitTitle } from '../utils/titleParser.js'
import { LABEL_OPTIONS } from '../constants/labels.js'
import { api } from '../api.js'

const props = defineProps({
  favorites: { type: Array, required: true },
})

const emit = defineEmits(['update', 'close'])

const columns = LABEL_OPTIONS

const backdropDown = ref(false)
const dragOverCol = ref(null)
const confettiCanvas = ref(null)
let dragItem = null
let fireConfetti = null
let partyBuffer = null

function onBackdropUp() {
  if (backdropDown.value) emit('close')
  backdropDown.value = false
}

function columnItems(label) {
  return props.favorites.filter(f => (f.label || 'fresh') === label)
}



function onDragStart(item, e) {
  dragItem = item
  e.dataTransfer.effectAllowed = 'move'
}

function onDragOver(col) {
  dragOverCol.value = col
}

function onDragEnd() {
  dragItem = null
  dragOverCol.value = null
}

function onDrop(targetLabel) {
  dragOverCol.value = null
  if (!dragItem) return
  const prevLabel = dragItem.label || 'fresh'
  if (prevLabel === targetLabel) { dragItem = null; return }

  /* Update the label in the favorites array */
  const updated = [...props.favorites]
  const fav = updated.find(f => f.title === dragItem.title)
  if (fav) {
    fav.label = targetLabel
    emit('update', updated)

    // Persist label change to DB
    if (fav.id) {
      api.updateSong(fav.id, { label: targetLabel })
    }

    /* Celebrate moving to "In Setlist" */
    if (targetLabel === 'in-setlist') {
      celebrate()
    }
  }
  dragItem = null
}

function sayKanban() {
  if (!('speechSynthesis' in window)) return
  const isEaster = Math.random() < 0.05
  const text = isEaster ? 'four hundred and ninety eight octillion' : 'KAHN-BAUN!'
  const utter = new SpeechSynthesisUtterance(text)
  utter.pitch = 0.3 + Math.random() * 1.7    // 0.3–2.0
  utter.rate = 0.5 + Math.random() * 1.0     // 0.5–1.5
  utter.volume = 0.6 + Math.random() * 0.4   // 0.6–1.0
  const voices = speechSynthesis.getVoices()
  if (voices.length) utter.voice = voices[Math.floor(Math.random() * voices.length)]
  speechSynthesis.speak(utter)
}

function celebrate() {
  /* Confetti */
  if (fireConfetti) {
    const colors = ['#e74c3c', '#f1c40f', '#2ecc71', '#3498db', '#9b59b6', '#e67e22', '#1abc9c']
    for (let i = 0; i < 3; i++) {
      setTimeout(() => {
        fireConfetti({
          particleCount: 80,
          angle: 270,
          spread: 100,
          origin: { y: -0.15, x: 0.5 },
          colors,
          shapes: ['star', 'circle'],
          scalar: 1.2,
          gravity: .4,
        })
      }, i * 200)
    }
  }

  /* Play party.wav (first 2 seconds), then say Kanban! */
  if (partyBuffer) {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      const src = ctx.createBufferSource()
      const gain = ctx.createGain()
      src.buffer = partyBuffer
      gain.gain.value = 0.5
      src.connect(gain)
      gain.connect(ctx.destination)
      src.start(0, 0, 2)
      setTimeout(sayKanban, 1000)
    } catch {}
  }
}

onMounted(() => {
  sayKanban()

  /* Init confetti */
  if (confettiCanvas.value) {
    confettiCanvas.value.width = window.innerWidth
    confettiCanvas.value.height = window.innerHeight
    fireConfetti = confettiModule.create(confettiCanvas.value, { resize: true })
  }

  /* Preload party sound */
  fetch('/party.ogg')
    .then(r => r.arrayBuffer())
    .then(buf => {
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      return ctx.decodeAudioData(buf)
    })
    .then(decoded => { partyBuffer = decoded })
    .catch(() => {})
})

onUnmounted(() => {
  if (fireConfetti) fireConfetti.reset()
})
</script>

<style scoped>

.kanban-panel {
  background: var(--bg-app);
  width: calc(100vw - 2.5rem);
  height: calc(100vh - 2.5rem);
  display: flex;
  flex-direction: column;
  padding: 1.5rem;
}

.kanban-title {
  font-family: 'Bangers', cursive;
  font-size: 5rem;
  font-weight: 400;
  letter-spacing: 0.12em;
  margin: 0 0 1rem 0;
  text-align: center;
  position: relative;
  color: #000;
  -webkit-text-stroke: 7px #000;
  isolation: isolate;
  user-select: none;
}

.kanban-title::before {
  content: attr(data-text);
  position: absolute;
  inset: 0;
  z-index: 1;
  background: linear-gradient(90deg, #e74c3c, #f39c12, #f1c40f, #2ecc71, #3498db, #9b59b6, #e74c3c);
  background-size: 200% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  -webkit-text-stroke: 0;
  animation: kanban-rainbow 3s linear infinite;
}

.kanban-title::after {
  content: attr(data-text);
  position: absolute;
  inset: 7px 0 0 13px;
  z-index: -1;
  color: #e84393;
  -webkit-text-fill-color: #e84393;
  -webkit-text-stroke: 0;
}

@keyframes kanban-rainbow {
  0% { background-position: 0% 50%; }
  100% { background-position: 200% 50%; }
}

.kanban-columns {
  display: flex;
  gap: var(--space-lg);
  flex: 1;
  min-height: 0;
}

.kanban-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--bg-elevated);
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  transition: border-color var(--speed-normal), box-shadow var(--speed-normal);
}

.kanban-col.drag-target {
  border-color: var(--col-color);
  box-shadow: 0 0 12px var(--bg-hover-subtle);
}

.kanban-col-header {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: 1rem 1.25rem;
  font-size: 1.3rem;
  font-weight: 600;
  color: var(--text-muted);
  border-bottom: 1px solid var(--border);
  user-select: none;
}

.kanban-col-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.kanban-col-count {
  margin-left: auto;
  color: var(--text-dim);
  font-size: 1.1rem;
}

.kanban-col-body {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-md);
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  scrollbar-width: thin;
  scrollbar-color: var(--border-light) transparent;
}

.kanban-col-body::-webkit-scrollbar {
  width: 0.375rem;
}

.kanban-col-body::-webkit-scrollbar-track {
  background: transparent;
}

.kanban-col-body::-webkit-scrollbar-thumb {
  background: var(--border-light);
  border-radius: 0.1875rem;
}

.kanban-col-body::-webkit-scrollbar-thumb:hover {
  background: var(--border-light);
}

.kanban-card {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 0.6rem 0.8rem;
  cursor: grab;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  transition: background var(--speed-fast), border-color var(--speed-fast);
}

.kanban-card:hover {
  background: var(--border);
  border-color: var(--border-light);
}

.kanban-card:active {
  cursor: grabbing;
}

.kanban-card-artist {
  font-size: 1.05rem;
  color: var(--text-dim);
}

.kanban-card-track {
  font-size: 1.3rem;
  color: var(--text-primary);
}

.kanban-empty {
  color: var(--text-faint);
  text-align: center;
  padding: 2rem 1rem;
  font-size: 1.1rem;
}

.confetti-canvas {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 9999;
  pointer-events: none;
}
</style>
