<template>
  <div class="dashboard">
    <!-- Album art mosaic background -->
    <div v-if="mosaicArts.length || DEBUG_MOSAIC" class="mosaic-wrap">
      <div ref="gridRef" class="mosaic-grid" :style="{ '--cols': mosaicCols * 2 }">
        <template v-if="DEBUG_MOSAIC">
          <div
            v-for="(cell, i) in debugTiles"
            :key="i"
            class="mosaic-tile debug-tile"
            :class="{ 'debug-panel-b': cell.panel === 'B' }"
            :style="{ background: cell.color }"
          >
            <span class="debug-label">{{ cell.label }}</span>
          </div>
        </template>
        <template v-else>
          <img
            v-for="(art, i) in mosaicTiles"
            :key="i"
            :src="art"
            class="mosaic-tile"
            alt=""
            loading="lazy"
          />
        </template>
      </div>
      <!-- Tilt-shift blur: progressive DOF layers -->
      <div class="mosaic-tiltblur ts-top ts-light"></div>
      <div class="mosaic-tiltblur ts-top ts-medium"></div>
      <div class="mosaic-tiltblur ts-top ts-heavy"></div>
      <div class="mosaic-tiltblur ts-bottom ts-light"></div>
      <div class="mosaic-tiltblur ts-bottom ts-medium"></div>
      <div class="mosaic-tiltblur ts-bottom ts-heavy"></div>
      <div class="mosaic-overlay"></div>
      <!-- Search button -->
      <button class="dashboard-search-btn" @click.stop="$emit('open-library')" title="Browse Library">
        <MdiIcon :path="mdiMagnify" :size="28" />
      </button>
    </div>
    <!-- Logo -->
    <div class="dashboard-logo">
      <img src="/SloshRat.png" alt="Slosh Rat" class="dashboard-rat" />
    </div>

    <!-- Label Breakdown Bar -->
    <div v-if="totalSongs > 0" class="label-bar-wrap" @click="$emit('open-kanban')">
      <div class="label-legend">
        <span v-for="seg in labelSegments" :key="'l-' + seg.label" class="legend-item">
          <span class="legend-dot" :style="{ background: seg.color }"></span>
          {{ seg.label }} ({{ seg.count }})
        </span>
      </div>
      <div class="label-bar">
        <div
          v-for="seg in labelSegments"
          :key="seg.label"
          class="label-segment"
          :style="{ width: seg.pct + '%', background: seg.color }"
          :title="seg.label + ': ' + seg.count"
        ></div>
      </div>
    </div>

    <!-- Two-column section: Recently Added + Most Played -->
    <div class="dashboard-columns" v-if="totalSongs > 0">
      <div class="dashboard-section">
        <h3 class="section-title">Recently Added</h3>
        <div class="song-list">
          <div
            v-for="song in recentlyAdded"
            :key="'r-' + song.title"
            class="song-card"
            @click="$emit('select', song)"
          >
            <img v-if="song.albumArt" :src="song.albumArt" class="song-art" alt="" />
            <div v-else class="song-art-placeholder">♪</div>
            <div class="song-info">
              <span class="song-artist">{{ splitTitle(song.title).artist }}</span>
              <span class="song-track">{{ splitTitle(song.title).track }}</span>
            </div>
          </div>
        </div>
      </div>
      <div class="dashboard-section">
        <h3 class="section-title">Most Played</h3>
        <div class="song-list">
          <div
            v-for="song in mostPlayed"
            :key="'m-' + song.title"
            class="song-card"
            @click="$emit('select', song)"
          >
            <img v-if="song.albumArt" :src="song.albumArt" class="song-art" alt="" />
            <div v-else class="song-art-placeholder">♪</div>
            <div class="song-info">
              <span class="song-artist">{{ splitTitle(song.title).artist }}</span>
              <span class="song-track">{{ splitTitle(song.title).track }}</span>
            </div>
            <span class="play-badge">{{ song.playCount }}×</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Empty state -->
    <div v-if="totalSongs === 0" class="dashboard-empty">
      <div class="hint">Press Space to open your library</div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted, onUnmounted } from 'vue'
import MdiIcon from './MdiIcon.vue'
import { mdiMagnify } from '@mdi/js'

const DEBUG_MOSAIC = false // ← flip to true for debug grid

const props = defineProps({
  favorites: { type: Array, default: () => [] },
})

defineEmits(['select', 'open-kanban', 'open-library'])

const totalSongs = computed(() => props.favorites.length)

const labelColors = { fresh: '#e74c3c', 'getting-there': '#f1c40f', 'in-setlist': '#2ecc71' }
const labelNames = { fresh: 'Fresh', 'getting-there': 'Getting There', 'in-setlist': 'In Setlist' }

const labelSegments = computed(() => {
  const counts = { fresh: 0, 'getting-there': 0, 'in-setlist': 0 }
  for (const f of props.favorites) counts[f.label || 'fresh']++
  const total = props.favorites.length || 1
  return Object.entries(counts)
    .filter(([, count]) => count > 0)
    .map(([key, count]) => ({
      label: labelNames[key],
      count,
      color: labelColors[key],
      pct: (count / total) * 100,
    }))
})

const recentlyAdded = computed(() => {
  return [...props.favorites].reverse().slice(0, 6)
})

const mostPlayed = computed(() => {
  return [...props.favorites]
    .filter(f => (f.playCount || 0) > 0)
    .sort((a, b) => (b.playCount || 0) - (a.playCount || 0))
    .slice(0, 6)
})

// Extract the unique image identifier from a URL for dedup.
// Spotify CDN URLs look like https://i.scdn.co/image/ab67616d0000b273HASH —
// the last path segment is the image ID regardless of size prefix.
function imageKey(url) {
  try {
    const segments = new URL(url).pathname.split('/')
    let key = segments[segments.length - 1] || url
    // Spotify image IDs start with a size prefix (e.g. ab67616d0000b273)
    // Strip it so different sizes of the same art share one key
    key = key.replace(/^ab67616d[0-9a-f]{8}/, '')
    return key
  } catch {
    return url
  }
}

const albumArts = computed(() => {
  const seenKeys = new Set()
  return props.favorites
    .filter(f => {
      if (!f.albumArt) return false
      const key = imageKey(f.albumArt)
      if (seenKeys.has(key)) return false
      seenKeys.add(key)
      return true
    })
    .map(f => f.albumArt)
})

const MIN_MOSAIC_ARTS = 50
const placeholderArts = ref([])

// Blend user arts + popular rock placeholders to fill the mosaic
const mosaicArts = computed(() => {
  const userArts = albumArts.value
  if (userArts.length >= MIN_MOSAIC_ARTS) return userArts
  // Append enough placeholders to reach threshold, skip any URLs already in user set
  const userSet = new Set(userArts)
  const filler = placeholderArts.value.filter(url => !userSet.has(url))
  return [...userArts, ...filler].slice(0, MIN_MOSAIC_ARTS)
})

// Dynamic grid: always sized to fit all available arts uniquely (shuffle path guaranteed)
// Minimum 7 cols for viewport coverage, 5 rows for vertical coverage
const MOSAIC_ROWS = 5
const mosaicCols = computed(() => Math.max(7, Math.floor(mosaicArts.value.length / MOSAIC_ROWS)))

// Simple seeded PRNG — same arts always produce the same mosaic layout
function seededRng(arts) {
  let s = arts.reduce((h, url) => ((h << 5) - h + url.charCodeAt(0)) | 0, 0)
  return () => {
    s = (s * 1664525 + 1013904223) | 0
    return (s >>> 0) / 0x100000000
  }
}

// Fill the grid — use each art at most once if we have enough, otherwise repeat with no-adjacent constraint
const mosaicTiles = computed(() => {
  const arts = mosaicArts.value
  const cols = mosaicCols.value
  const rows = MOSAIC_ROWS
  const gridSize = cols * rows
  const rand = seededRng(arts)

  // Shuffle helper
  function shuffle(arr) {
    const a = [...arr]
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]]
    }
    return a
  }

  // Keep user arts and filler arts separate — user fills first, filler takes the rest
  const userCount = albumArts.value.length
  const userPool = shuffle(arts.slice(0, userCount))
  const fillerPool = shuffle(arts.slice(userCount))
  const grid = [...userPool, ...fillerPool].slice(0, gridSize)

  // Duplicate each row horizontally for seamless left-to-right loop
  const tiled = []
  for (let r = 0; r < rows; r++) {
    const rowSlice = grid.slice(r * cols, r * cols + cols)
    tiled.push(...rowSlice, ...rowSlice)
  }
  return tiled
})

// Diagnostics for mosaic grid
const mosaicDiag = computed(() => {
  const tiles = mosaicTiles.value
  if (!tiles.length) return { path: '-', dupes: 0, unique: 0 }
  const cols = mosaicCols.value
  // Only check Panel A (first half of each row)
  const panelA = []
  const rows = MOSAIC_ROWS
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      panelA.push(tiles[r * cols * 2 + c])
    }
  }
  const unique = new Set(panelA).size
  const dupes = panelA.length - unique
  const path = mosaicArts.value.length >= cols * rows ? 'SHUFFLE' : 'GREEDY'
  if (dupes > 0) {
    const seen = new Map()
    panelA.forEach((art, i) => {
      const r = Math.floor(i / cols)
      const c = i % cols
      const letters = 'abcdefghijklmnopqrstuvwxyz'
      const label = `${r + 1}${letters[c]}`
      if (seen.has(art)) seen.get(art).push(label)
      else seen.set(art, [label])
    })
    for (const [art, labels] of seen) {
      if (labels.length > 1) console.warn('DUPE:', labels.join(' = '), art)
    }
  }
  return { path, dupes, unique }
})

// Labels matching mosaicTiles layout (Panel A + Panel B per row)
const tileLabels = computed(() => {
  const cols = mosaicCols.value
  const rows = MOSAIC_ROWS
  const letters = 'abcdefghijklmnopqrstuvwxyz'
  const labels = []
  for (let r = 0; r < rows; r++) {
    for (let panel = 0; panel < 2; panel++) {
      for (let c = 0; c < cols; c++) {
        labels.push(`${r + 1}${letters[c]}${panel === 1 ? "'" : ''}`)
      }
    }
  }
  return labels
})

const debugRows = computed(() => MOSAIC_ROWS)

// Debug tiles: labeled cells showing row number + column letter, colored by column
const debugTiles = computed(() => {
  const cols = mosaicCols.value
  const rows = debugRows.value
  const letters = 'abcdefghijklmnopqrstuvwxyz'
  const hueStep = 360 / cols
  const tiles = []
  // Panel A then Panel B for each row
  for (let r = 0; r < rows; r++) {
    for (let panel = 0; panel < 2; panel++) {
      for (let c = 0; c < cols; c++) {
        const hue = (c * hueStep) % 360
        tiles.push({
          label: `${r + 1}${letters[c % 26]}`,
          color: `hsl(${hue}, 60%, ${panel === 0 ? 35 : 25}%)`,
          panel: panel === 0 ? 'A' : 'B',
        })
      }
    }
  }
  return tiles
})

function splitTitle(title) {
  const sep = title.indexOf(' — ')
  if (sep < 0) return { artist: '', track: title }
  return { artist: title.substring(0, sep), track: title.substring(sep + 3) }
}

// Infinite horizontal scroll via requestAnimationFrame
const gridRef = ref(null)
let animId = null
let scrollX = 0
const SCROLL_SPEED = 0.3 // pixels per frame (~18px/sec at 60fps)

const debugStats = ref({ scrollX: 0, halfWidth: 0, progress: 0 })
const debugScale = ref(1.2)

function animate() {
  if (!gridRef.value) return
  scrollX -= SCROLL_SPEED
  const halfWidth = gridRef.value.scrollWidth / 2
  if (halfWidth > 0 && Math.abs(scrollX) >= halfWidth) {
    scrollX += halfWidth
  }
  gridRef.value.style.transform = `rotateX(20deg) scale(${debugScale.value}) translateX(${scrollX}px)`

  debugStats.value = {
    scrollX: Math.round(scrollX),
    halfWidth: Math.round(halfWidth),
    progress: halfWidth > 0 ? Math.round((Math.abs(scrollX) / halfWidth) * 100) : 0,
  }

  animId = requestAnimationFrame(animate)
}

function jumpToStart() {
  scrollX = 0
}

function jumpToEnd() {
  if (!gridRef.value) return
  const halfWidth = gridRef.value.scrollWidth / 2
  scrollX = -(halfWidth - 1)
}

onMounted(() => {
  // Start scrolling after the fade-in completes
  setTimeout(() => { animId = requestAnimationFrame(animate) }, 900)

  // Fetch popular rock album art for mosaic placeholders
  fetch('/api/popular-art')
    .then(r => r.ok ? r.json() : { arts: [] })
    .then(data => { placeholderArts.value = data.arts || [] })
    .catch(() => {})
})

onUnmounted(() => {
  if (animId) cancelAnimationFrame(animId)
})
</script>

<style scoped>
.dashboard {
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100%;
  padding: 2rem 3rem;
  gap: 1.5rem;
  overflow-y: auto;
  animation: dashFadeIn 0.4s ease;
  position: relative;
}

.dashboard-search-btn {
  position: fixed;
  top: 1rem;
  right: 1.5rem;
  z-index: 5;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 50%;
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
}

.dashboard-search-btn:hover {
  background: rgba(255, 255, 255, 0.15);
  color: rgba(255, 255, 255, 0.9);
}

/* Mosaic background */
.mosaic-wrap {
  position: absolute;
  inset: 0;
  overflow: hidden;
  z-index: 0;
  perspective: 600px;
}

.mosaic-grid {
  display: grid;
  grid-template-columns: repeat(var(--cols, 8), 1fr);
  gap: 0;
  width: 400%;
  position: absolute;
  top: -50%;
  left: -50%;
  transform: rotateX(20deg) scale(1.2);
  transform-origin: center center;
  opacity: 0;
  animation: mosaicFadeIn 0.8s ease 0.1s forwards;
}

@keyframes mosaicFadeIn {
  to { opacity: 0.25; }
}

/* Debug mode */
.debug-tile {
  position: relative;
  border: 1px solid rgba(255, 255, 255, 0.3);
  overflow: hidden;
}

.tile-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.debug-panel-b {
  border-color: rgba(255, 80, 80, 0.6);
}

.debug-label {
  position: absolute;
  font-size: 1.4rem;
  font-weight: 900;
  color: white;
  text-shadow: 0 2px 6px rgba(0, 0, 0, 1), 0 0 10px rgba(0, 0, 0, 0.8);
  pointer-events: none;
  line-height: 1;
}
.dl-tl { top: 3px; left: 4px; }
.dl-tr { top: 3px; right: 4px; }
.dl-bl { bottom: 3px; left: 4px; }
.dl-br { bottom: 3px; right: 4px; }

.debug-hud {
  position: fixed;
  top: 10px;
  right: 10px;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.85);
  color: #0f0;
  font-family: monospace;
  font-size: 13px;
  padding: 10px 14px;
  border-radius: 6px;
  line-height: 1.6;
}

.debug-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.debug-slider {
  width: 100px;
  accent-color: #0f0;
}

.debug-buttons {
  display: flex;
  gap: 6px;
  margin-top: 6px;
}

.debug-buttons button {
  flex: 1;
  padding: 4px 8px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid #0f0;
  color: #0f0;
  font-family: monospace;
  font-size: 12px;
  border-radius: 4px;
  cursor: pointer;
}

.debug-buttons button:hover {
  background: rgba(0, 255, 0, 0.15);
}

/* In debug mode, make grid fully visible */
.mosaic-grid:has(.debug-tile) {
  animation: mosaicFadeInDebug 0.3s ease forwards !important;
}

@keyframes mosaicFadeInDebug {
  to { opacity: 1; }
}

.mosaic-tile {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  display: block;
}

.mosaic-overlay {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at 50% 50%, rgba(0, 0, 0, 0.473) 0%, rgba(0,0,0,0.8) 100%);
  z-index: 1;
}

/* Tilt-shift: progressive DOF blur (3 layers per edge) */
.mosaic-tiltblur {
  position: absolute;
  left: 0;
  right: 0;
  pointer-events: none;
}

/* Top DOF — shorter and subtler */
.ts-top.ts-light {
  height: 30%;
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
}
.ts-top.ts-medium {
  height: 18%;
  backdrop-filter: blur(5px);
  -webkit-backdrop-filter: blur(5px);
}
.ts-top.ts-heavy {
  height: 10%;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

/* Bottom DOF — stronger depth blur */
.ts-bottom.ts-light {
  height: 55%;
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
}
.ts-bottom.ts-medium {
  height: 38%;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}
.ts-bottom.ts-heavy {
  height: 22%;
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
}

/* Top edge: fade from solid at top to transparent */
.ts-top {
  top: 0;
  mask-image: linear-gradient(to bottom, black 0%, transparent 100%);
  -webkit-mask-image: linear-gradient(to bottom, black 0%, transparent 100%);
}

/* Bottom edge: fade from solid at bottom to transparent */
.ts-bottom {
  bottom: 0;
  mask-image: linear-gradient(to top, black 0%, transparent 100%);
  -webkit-mask-image: linear-gradient(to top, black 0%, transparent 100%);
}

/* Ensure all dashboard content sits above the mosaic */
.dashboard > *:not(.mosaic-wrap) {
  position: relative;
  z-index: 2;
}

@keyframes dashFadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Logo */
.dashboard-logo {
  flex-shrink: 0;
  margin: 1.5rem 0;
}

.dashboard-rat {
  max-height: 30vh;
  width: auto;
  filter: drop-shadow(0 0 30px rgba(245, 197, 66, 0.15));
}

/* Stats Row */
.stats-row {
  display: flex;
  gap: 1.5rem;
  width: 100%;
  max-width: 1100px;
}

.stat-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.3rem;
  padding: 1.25rem 1rem;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 12px;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  transition: border-color 0.2s, background 0.2s;
}

.stat-card:hover {
  border-color: rgba(245, 197, 66, 0.2);
  background: rgba(255, 255, 255, 0.05);
}

.stat-value {
  font-size: 2.4rem;
  font-weight: 700;
  color: #f5c542;
  line-height: 1;
  letter-spacing: -0.02em;
}

.stat-label {
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.35);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

/* Label Breakdown */
.label-bar-wrap {
  width: 100%;
  max-width: 1100px;
  cursor: pointer;
}

.label-bar {
  margin: 20px 0;
  display: flex;
  height: 15px;
  border-radius: 3px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.05);
}

.label-segment {
  transition: width 0.5s ease;
}

.label-legend {
  display: flex;
  justify-content: left;
  gap: 1.5rem;
  margin-top: 0.5rem;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 1rem;
  color: rgba(255, 255, 255, 0.719);
}

.legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

/* Two-Column Sections */
.dashboard-columns {
  display: flex;
  gap: 2rem;
  width: 100%;
  max-width: 1100px;
  flex: 1;
  min-height: 0;
}

.dashboard-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  min-width: 0;
}

.section-title {
  font-size: 1.1rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: rgba(255, 255, 255, 0.692);
  padding-bottom: 0.4rem;
}

/* Song Cards */
.song-list {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.song-card {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  padding: 0.75rem 1rem;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  cursor: pointer;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  transition: background 0.15s, border-color 0.15s;
}

.song-card:hover {
  background: rgba(255, 255, 255, 0.07);
  border-color: rgba(245, 197, 66, 0.15);
}

.song-art {
  width: 48px;
  height: 48px;
  border-radius: 4px;
  object-fit: cover;
  flex-shrink: 0;
}

.song-art-placeholder {
  width: 48px;
  height: 48px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.05);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.2rem;
  color: rgba(255, 255, 255, 0.15);
  flex-shrink: 0;
}

.song-info {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  min-width: 0;
}

.song-artist {
  font-size: 0.95rem;
  color: rgba(255, 255, 255, 0.35);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.song-track {
  font-size: 1.25rem;
  color: rgba(255, 255, 255, 0.8);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.play-badge {
  margin-left: auto;
  font-size: 1.1rem;
  color: #f5c542;
  font-weight: 600;
  flex-shrink: 0;
  opacity: 0.7;
}

/* Empty state */
.dashboard-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.dashboard-empty .hint {
  font-size: 1.6rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.3);
}
</style>
