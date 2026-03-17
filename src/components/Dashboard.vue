<template>
  <div class="dashboard">
    <!-- Hidden rick roll reset (inline styles beat scoped specificity) -->
    <div
      style="position:fixed !important;top:0;left:0;width:40px;height:40px;z-index:100 !important;cursor:pointer"
      @click="localStorage.removeItem('lyricmachine_rr')"
    ></div>
    <!-- Album art mosaic background -->
    <div v-if="mosaicArts.length" class="mosaic-wrap">
      <div ref="gridRef" class="mosaic-grid" :class="{ 'mosaic-ready': mosaicReady }" :style="{ '--cols': mosaicCols * 2 }">
        <img
            v-for="(art, i) in mosaicTiles"
            :key="i"
            :src="art"
            class="mosaic-tile"
            alt=""
            loading="lazy"
          />
      </div>
      <!-- Tilt-shift blur: single top + bottom DOF layer -->
      <div class="mosaic-tiltblur ts-top"></div>
      <div class="mosaic-tiltblur ts-bottom"></div>
      <div class="mosaic-overlay"></div>
      <!-- Search button -->
      <div class="dashboard-top-btns">
        <button class="dashboard-icon-btn" @click.stop="$emit('toggle-settings')" title="Settings">
          <MdiIcon :path="mdiCog" :size="28" />
        </button>
        <button class="dashboard-icon-btn" @click.stop="$emit('open-library')" title="Browse Library">
          <MdiIcon :path="mdiMagnify" :size="28" />
        </button>
      </div>
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
import { computed, ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import MdiIcon from './MdiIcon.vue'
import { mdiMagnify, mdiCog } from '@mdi/js'

import { splitTitle } from '../utils/titleParser.js'
import { api } from '../api.js'

const props = defineProps({
  favorites: { type: Array, default: () => [] },
})

defineEmits(['select', 'open-kanban', 'open-library', 'toggle-settings'])

const totalSongs = computed(() => props.favorites.length)

import { LABEL_OPTIONS } from '../constants/labels.js'

const labelColors = Object.fromEntries(LABEL_OPTIONS.map(o => [o.value, o.color]))
const labelNames = Object.fromEntries(LABEL_OPTIONS.map(o => [o.value, o.name]))

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

// Module-level: survives component unmount/remount across navigations
const placeholderArts = ref([])
let placeholdersFetched = false

// Track which image URLs have already been preloaded by the browser.
// Album art URLs are stable — no need to re-verify them.
const preloadedUrls = new Set()

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


// Image preloading — fade in only after ALL tiles are loaded
const mosaicReady = ref(false)

watch(mosaicTiles, (tiles) => {
  if (!tiles.length) { mosaicReady.value = false; return }
  // Only preload URLs we haven't seen before
  const unique = [...new Set(tiles)]
  const needsPreload = unique.filter(src => !preloadedUrls.has(src))

  if (needsPreload.length === 0) {
    // All images already cached — show immediately
    mosaicReady.value = true
    nextTick(() => {
      if (gridRef.value && !animId) animId = requestAnimationFrame(animate)
    })
    return
  }

  mosaicReady.value = false
  Promise.all(needsPreload.map(src => new Promise(resolve => {
    const img = new Image()
    img.onload = () => { preloadedUrls.add(src); resolve() }
    img.onerror = () => { preloadedUrls.add(src); resolve() } // don't block on broken
    img.src = src
  }))).then(() => {
    mosaicReady.value = true
    nextTick(() => {
      if (gridRef.value && !animId) animId = requestAnimationFrame(animate)
    })
  })
}, { immediate: true })





// Infinite horizontal scroll via requestAnimationFrame
const gridRef = ref(null)
let animId = null
let scrollX = 0
const SCROLL_SPEED = 0.3 // pixels per frame (~18px/sec at 60fps)

const SCALE = 1.2

function animate() {
  if (!gridRef.value) return
  scrollX -= SCROLL_SPEED
  const halfWidth = gridRef.value.scrollWidth / 2
  if (halfWidth > 0 && Math.abs(scrollX) >= halfWidth) {
    scrollX += halfWidth
  }
  gridRef.value.style.transform = `rotateX(20deg) scale(${SCALE}) translateX(${scrollX}px)`
  animId = requestAnimationFrame(animate)
}

onMounted(() => {
  // Fetch popular rock album art for mosaic placeholders (once per session)
  if (!placeholdersFetched) {
    placeholdersFetched = true
    api.getPopularArt()
      .then(data => { placeholderArts.value = data?.arts || [] })
      .catch(() => { placeholdersFetched = false }) // retry on failure
  }
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
  position: relative;
}

.dashboard-top-btns {
  position: fixed;
  top: 1rem;
  right: 1.5rem;
  z-index: 5;
  display: flex;
  gap: 0.5rem;
}

.dashboard-icon-btn {
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
  transition: background var(--speed-normal), color var(--speed-normal);
}

.dashboard-icon-btn:hover {
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
  transform-origin: center center;
  opacity: 0;
  transition: opacity 0.8s ease;
}

.mosaic-grid.mosaic-ready {
  opacity: 0.25;
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

/* Tilt-shift: single DOF blur per edge */
.mosaic-tiltblur {
  position: absolute;
  left: 0;
  right: 0;
  pointer-events: none;
}

.ts-top {
  top: 0;
  height: 30%;
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  mask-image: linear-gradient(to bottom, black 0%, transparent 100%);
  -webkit-mask-image: linear-gradient(to bottom, black 0%, transparent 100%);
}

.ts-bottom {
  bottom: 0;
  height: 55%;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
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
  transition: border-color var(--speed-normal), background var(--speed-normal);
}

.stat-card:hover {
  border-color: rgba(245, 197, 66, 0.2);
  background: rgba(255, 255, 255, 0.05);
}

.stat-value {
  font-size: 2.4rem;
  font-weight: 700;
  color: var(--accent);
  line-height: 1;
  letter-spacing: -0.02em;
}

.stat-label {
  font-size: var(--font-sm);
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
  gap: var(--space-sm);
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
  gap: var(--space-md);
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
  transition: background var(--speed-fast), border-color var(--speed-fast);
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
  font-size: var(--font-md);
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
  color: var(--accent);
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
