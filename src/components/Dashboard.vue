<template>
  <div class="dashboard">
    <!-- Logo -->
    <div class="dashboard-logo">
      <img src="/SloshRat.png" alt="Slosh Rat" class="dashboard-rat" />
    </div>

    <!-- Stats Row -->
    <div class="stats-row">
      <div class="stat-card" v-for="stat in stats" :key="stat.label">
        <span class="stat-value">{{ stat.value }}</span>
        <span class="stat-label">{{ stat.label }}</span>
      </div>
    </div>

    <!-- Label Breakdown Bar -->
    <div v-if="totalSongs > 0" class="label-bar-wrap">
      <div class="label-bar">
        <div
          v-for="seg in labelSegments"
          :key="seg.label"
          class="label-segment"
          :style="{ width: seg.pct + '%', background: seg.color }"
          :title="seg.label + ': ' + seg.count"
        ></div>
      </div>
      <div class="label-legend">
        <span v-for="seg in labelSegments" :key="'l-' + seg.label" class="legend-item">
          <span class="legend-dot" :style="{ background: seg.color }"></span>
          {{ seg.label }} ({{ seg.count }})
        </span>
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
import { computed } from 'vue'

const props = defineProps({
  favorites: { type: Array, default: () => [] },
})

defineEmits(['select'])

const totalSongs = computed(() => props.favorites.length)
const songsPlayed = computed(() => props.favorites.filter(f => f.played).length)
const totalPlays = computed(() => props.favorites.reduce((sum, f) => sum + (f.playCount || 0), 0))

const stats = computed(() => [
  { label: 'Total Songs', value: totalSongs.value },
  { label: 'Songs Played', value: songsPlayed.value },
  { label: 'Total Plays', value: totalPlays.value },
])

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
  return [...props.favorites].reverse().slice(0, 5)
})

const mostPlayed = computed(() => {
  return [...props.favorites]
    .filter(f => (f.playCount || 0) > 0)
    .sort((a, b) => (b.playCount || 0) - (a.playCount || 0))
    .slice(0, 5)
})

function splitTitle(title) {
  const sep = title.indexOf(' — ')
  if (sep < 0) return { artist: '', track: title }
  return { artist: title.substring(0, sep), track: title.substring(sep + 3) }
}
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
}

@keyframes dashFadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Logo */
.dashboard-logo {
  flex-shrink: 0;
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
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  backdrop-filter: blur(10px);
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
}

.label-bar {
  display: flex;
  height: 6px;
  border-radius: 3px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.05);
}

.label-segment {
  transition: width 0.5s ease;
}

.label-legend {
  display: flex;
  justify-content: center;
  gap: 1.5rem;
  margin-top: 0.5rem;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 1rem;
  color: rgba(255, 255, 255, 0.4);
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
  color: rgba(255, 255, 255, 0.3);
  padding-bottom: 0.4rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
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
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  cursor: pointer;
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
