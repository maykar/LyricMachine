<template>
  <div class="kanban-backdrop" @mousedown.self="backdropDown = true" @mouseup.self="onBackdropUp">
    <div class="kanban-panel">
      <button class="kanban-close" @click="$emit('close')" title="Close"><MdiIcon :path="mdiClose" :size="18" /></button>
      <h2 class="kanban-title" data-text="KANBAN!">KANBAN!</h2>

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
              <span class="kanban-card-artist">{{ splitTitle(item.title).artist }}</span>
              <span class="kanban-card-track">{{ splitTitle(item.title).track }}</span>
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

const props = defineProps({
  favorites: { type: Array, required: true },
})

const emit = defineEmits(['update', 'close'])

const columns = [
  { value: 'fresh', name: 'Fresh', color: '#e74c3c' },
  { value: 'getting-there', name: 'Getting There', color: '#f1c40f' },
  { value: 'in-setlist', name: 'In Setlist', color: '#2ecc71' },
]

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

function splitTitle(title) {
  const sep = title.indexOf(' — ')
  if (sep >= 0) return { artist: title.slice(0, sep), track: title.slice(sep + 3) }
  return { artist: '', track: title }
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

    /* Celebrate moving to "In Setlist" */
    if (targetLabel === 'in-setlist') {
      celebrate()
    }
  }
  dragItem = null
}

function sayKanban() {
  if ('speechSynthesis' in window) {
    const utter = new SpeechSynthesisUtterance('KAHN-BAUN!')
    utter.pitch = 0
    utter.rate = 0.4
    utter.volume = 0.7
    const voices = speechSynthesis.getVoices()
    const robot = voices.find(v => /zira|google uk|daniel|zarvox|alex/i.test(v.name))
    if (robot) utter.voice = robot
    speechSynthesis.speak(utter)
  }
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
@import url('https://fonts.googleapis.com/css2?family=Bangers&display=swap');
.kanban-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
}

.kanban-panel {
  background: #0e0e0e;
  border: 1px solid #222;
  border-radius: 16px;
  width: calc(100vw - 40px);
  height: calc(100vh - 40px);
  display: flex;
  flex-direction: column;
  position: relative;
  padding: 1.5rem;
}

.kanban-close {
  position: absolute;
  top: 0.8rem;
  right: 1rem;
  background: none;
  border: none;
  color: rgba(255,255,255,0.3);
  font-size: 1.2rem;
  cursor: pointer;
  z-index: 10;
}

.kanban-close:hover { color: #e74c3c; }

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
  gap: 1rem;
  flex: 1;
  min-height: 0;
}

.kanban-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #141414;
  border-radius: 12px;
  border: 1px solid #222;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.kanban-col.drag-target {
  border-color: var(--col-color);
  box-shadow: 0 0 12px rgba(255,255,255,0.05);
}

.kanban-col-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.8rem 1rem;
  font-size: 0.85rem;
  font-weight: 600;
  color: rgba(255,255,255,0.6);
  border-bottom: 1px solid #222;
  user-select: none;
}

.kanban-col-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.kanban-col-count {
  margin-left: auto;
  color: rgba(255,255,255,0.3);
  font-size: 0.75rem;
}

.kanban-col-body {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  scrollbar-width: thin;
  scrollbar-color: #333 transparent;
}

.kanban-col-body::-webkit-scrollbar {
  width: 6px;
}

.kanban-col-body::-webkit-scrollbar-track {
  background: transparent;
}

.kanban-col-body::-webkit-scrollbar-thumb {
  background: #333;
  border-radius: 3px;
}

.kanban-col-body::-webkit-scrollbar-thumb:hover {
  background: #444;
}

.kanban-card {
  background: #1a1a1a;
  border: 1px solid #2a2a2a;
  border-radius: 8px;
  padding: 0.6rem 0.8rem;
  cursor: grab;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  transition: background 0.15s, border-color 0.15s;
}

.kanban-card:hover {
  background: #222;
  border-color: #333;
}

.kanban-card:active {
  cursor: grabbing;
}

.kanban-card-artist {
  font-size: 0.7rem;
  color: rgba(255,255,255,0.35);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.kanban-card-track {
  font-size: 0.85rem;
  color: rgba(255,255,255,0.8);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.kanban-empty {
  color: rgba(255,255,255,0.2);
  text-align: center;
  padding: 2rem 1rem;
  font-size: 0.8rem;
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
