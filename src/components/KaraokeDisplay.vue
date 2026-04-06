<template>
  <div class="karaoke-wrapper" ref="wrapperRef" @click="handleWrapperClick">
    <!-- Lyrics scroll area -->
    <div class="karaoke-scroll slim-scrollbar" :class="{ 'no-smooth': smoothMode }" ref="scrollRef">
      <div class="karaoke-track" ref="trackRef">
        <div class="karaoke-spacer"></div>

        <!-- Count-in display (before first line) always occupies space to prevent scroll jumps -->
        <div
          class="karaoke-line karaoke-line--active karaoke-count-in"
          :style="{ fontSize: activeFontSize, opacity: showCountIn ? 1 : 0 }"
        >
          <span class="karaoke-instrumental">{{ countInSeconds > 0 ? `♪ ${countInSeconds}s ♪` : '♪♪♪' }}</span>
        </div>

        <div
          v-for="(line, i) in parsedLines"
          :key="i"
          class="karaoke-line"
          :class="{
            'karaoke-line--smooth': smoothMode,
            'karaoke-line--active': i === currentLineIndex && !showCountIn && (!smoothMode || teleprompterHighlight),
            'karaoke-line--past': i < currentLineIndex && !smoothMode,
            'karaoke-line--future': (i > currentLineIndex || (i === currentLineIndex && showCountIn)) && !smoothMode,
            'karaoke-line--instrumental': !line.text.trim(),
          }"
          :style="{ 
            fontSize: i === currentLineIndex && !showCountIn && !smoothMode ? activeFontSize : baseFontSize
          }"
          @click.stop="seekToLine(i)"
        >
          <span v-if="line.text.trim()">{{ line.text }}</span>
          <span v-else class="karaoke-instrumental">
            {{ (i === currentLineIndex && !showCountIn && playing && instrumentalCountdown > 0) ? `♪ ${instrumentalCountdown}s ♪` : '♪♪♪' }}
          </span>
        </div>
        <div class="karaoke-spacer"></div>
      </div>
    </div>

    <!-- Controls bar -->
    <div class="karaoke-controls" @click.stop>
      <button class="karaoke-play-btn" @click.stop="togglePlayback" :title="playing ? 'Pause' : 'Play'">
        <svg viewBox="0 0 24 24" width="24" height="24">
          <path v-if="!playing" d="M8 5v14l11-7z" fill="currentColor" />
          <path v-else d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" fill="currentColor" />
        </svg>
      </button>

      <!-- Progress bar -->
      <div class="karaoke-progress-wrap" @click.stop="seekFromProgress">
        <div class="karaoke-progress-track" ref="progressRef">
          <div class="karaoke-progress-fill" :style="{ width: progressPercent + '%' }"></div>
        </div>
      </div>

      <!-- Time display -->
      <span class="karaoke-time">{{ formatTime(currentTime) }} / {{ formatTime(totalDuration) }}</span>



      <!-- Speed slider (disabled when synced to Spotify) -->
      <div 
        class="karaoke-speed" 
        :class="{ 'is-disabled': syncSpotify }"
        :title="syncSpotify ? 'To manually adjust speed, turn off Spotify Sync in the top-left menu' : 'Playback speed'"
        @click.stop
      >
        <input
          type="range"
          min="0.5"
          max="2"
          step="0.05"
          :value="speed"
          @input="onSpeedChange"
          class="karaoke-speed-slider"
          :disabled="syncSpotify"
        />
        <span class="karaoke-speed-label">{{ speed.toFixed(2) }}x</span>
      </div>

    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { api } from '../api.js'

const props = defineProps({
  syncedLyrics: { type: String, default: '' },
  spotifyTrackId: { type: String, default: null },
  initialAdjust: { type: Number, default: 0 },
})

const emit = defineEmits(['adjust-changed'])

import { useEventListener } from '@vueuse/core'

// --- LRC Parser ---
function parseLRC(lrc) {
  if (!lrc) return []
  const lines = []
  const regex = /^\[(\d{2}):(\d{2})\.(\d{2,3})\]\s?(.*)/
  for (const raw of lrc.split('\n')) {
    const match = raw.match(regex)
    if (match) {
      const mins = parseInt(match[1], 10)
      const secs = parseInt(match[2], 10)
      let ms = parseInt(match[3], 10)
      if (match[3].length === 2) ms *= 10
      const time = Math.max(0, mins * 60 + secs + ms / 1000 - 0.5)
      lines.push({ time, text: match[4] })
    }
  }
  return lines.sort((a, b) => a.time - b.time)
}

// --- State ---
const wrapperRef = ref(null)
const scrollRef = ref(null)
const progressRef = ref(null)
const parsedLines = computed(() => parseLRC(props.syncedLyrics))

const totalDuration = computed(() => {
  const lines = parsedLines.value
  if (!lines.length) return 0
  return lines[lines.length - 1].time + 5
})

const playing = ref(false)
const currentTime = ref(0)
const speed = ref(1)
const currentLineIndex = ref(-1)
const fontSizeOffset = ref(0)

import { useSettingsStore } from '../stores/settings.js'
import MdiIcon from './MdiIcon.vue'
import { mdiCog } from '@mdi/js'

const settingsStore = useSettingsStore()
const showSettings = ref(false)

const syncSpotify = computed({
  get: () => settingsStore.userDefaults.karaokeSyncEnabled ?? true,
  set: (val) => {
    settingsStore.userDefaults.karaokeSyncEnabled = val
    settingsStore.saveDefaults()
  }
})

const smoothMode = computed({
  get: () => settingsStore.userDefaults.karaokeSmoothEnabled ?? false,
  set: (val) => {
    settingsStore.userDefaults.karaokeSmoothEnabled = val
    settingsStore.saveDefaults()
  }
})

const teleprompterHighlight = computed(() => {
  return settingsStore.userDefaults.teleprompterHighlightEnabled ?? true
})

watch(smoothMode, (sm) => {
  if (trackRef.value) {
    if (!sm) {
      trackRef.value.style.transform = ''
      nextTick(() => scrollToLine(currentLineIndex.value))
    } else {
      if (scrollRef.value) scrollRef.value.scrollTop = 0
      applySmoothScroll()
    }
  }
})

// --- Font sizing ---
const ACTIVE_SCALE = 1.35
const wrapperWidth = ref(0)
const maxLineWidth100 = ref(0)

const baseFontSize = computed(() => {
  let baseRem = 1.8 // fallback
  if (wrapperWidth.value > 0 && maxLineWidth100.value > 0) {
    const remPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
    const paddingH = 4 * remPx // 2rem padding on each side per .karaoke-scroll css
    const availablePw = wrapperWidth.value - paddingH
    const effectiveScale = smoothMode.value ? 1.0 : ACTIVE_SCALE
    baseRem = ((availablePw * 100) / (maxLineWidth100.value * effectiveScale)) / remPx
    baseRem = Math.min(4.0, Math.max(0.8, baseRem))
  }
  return (baseRem + fontSizeOffset.value * 0.2) + 'rem'
})

const activeFontSize = computed(() => {
  let baseRem = parseFloat(baseFontSize.value)
  const effectiveScale = smoothMode.value ? 1.0 : ACTIVE_SCALE
  return (baseRem * effectiveScale) + 'rem'
})

function adjustFontSize(delta) {
  fontSizeOffset.value = Math.max(-5, Math.min(8, fontSizeOffset.value + delta))
  emit('adjust-changed', fontSizeOffset.value)
}

function resetFont() {
  fontSizeOffset.value = 0
  emit('adjust-changed', 0)
}

watch(() => props.initialAdjust, (val) => {
  fontSizeOffset.value = val || 0
})

watch(parsedLines, (lines) => {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  ctx.font = "600 100px 'Inter', sans-serif"
  let maxW = 0
  for (const line of lines) {
    const text = line.text.trim()
    if (!text) continue
    const w = ctx.measureText(text).width
    if (w > maxW) maxW = w
  }
  maxLineWidth100.value = maxW
}, { immediate: true })

function onKeydown(e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
  if (e.key === ' ') {
    e.preventDefault()
    togglePlayback()
  } else if (e.key === '0') {
    e.preventDefault()
    resetFont()
  } else if (e.key === '=' || e.key === '+') {
    e.preventDefault()
    adjustFontSize(1)
  } else if (e.key === '-' || e.key === '_') {
    e.preventDefault()
    adjustFontSize(-1)
  }
}

useEventListener(window, 'keydown', onKeydown)

// --- SDK availability (reactive via polling) ---
const sdkReady = ref(false)
let sdkCheckInterval = null

function checkSDK() {
  sdkReady.value = !!window.__spotify?.deviceId
}

let resizeObserver = null

onMounted(() => {
  checkSDK()
  // Poll every 2s to detect SDK becoming ready
  sdkCheckInterval = setInterval(checkSDK, 2000)
  
  resizeObserver = new ResizeObserver(() => {
    if (wrapperRef.value) wrapperWidth.value = wrapperRef.value.clientWidth
  })
  if (wrapperRef.value) resizeObserver.observe(wrapperRef.value)
})

onUnmounted(() => {
  if (sdkCheckInterval) clearInterval(sdkCheckInterval)
  if (resizeObserver) resizeObserver.disconnect()
})

// --- Count-in before first line ---
const firstLineTime = computed(() => {
  const lines = parsedLines.value
  return lines.length ? lines[0].time : 0
})

const showCountIn = computed(() => {
  if (!playing.value) return false
  return currentTime.value < firstLineTime.value
})

const countInSeconds = computed(() => {
  if (!showCountIn.value) return 0
  const effectiveSpeed = syncSpotify.value ? 1 : speed.value
  return Math.max(0, Math.ceil((firstLineTime.value - currentTime.value) / effectiveSpeed))
})

// Instrumental countdown
const instrumentalCountdown = computed(() => {
  const idx = currentLineIndex.value
  const lines = parsedLines.value
  if (idx < 0 || idx >= lines.length) return 0
  let nextIdx = idx + 1
  while (nextIdx < lines.length && !lines[nextIdx].text.trim()) nextIdx++
  if (nextIdx >= lines.length) return 0
  const effectiveSpeed = syncSpotify.value ? 1 : speed.value
  const remaining = (lines[nextIdx].time - currentTime.value) / effectiveSpeed
  return Math.max(0, Math.ceil(remaining))
})

const progressPercent = computed(() => {
  if (!totalDuration.value) return 0
  return Math.min(100, (currentTime.value / totalDuration.value) * 100)
})

// --- Independent timer engine (rAF-based) ---
let rafId = null
let lastTimestamp = null
let isWaitingForSpotify = false

function tick(timestamp) {
  if (!playing.value) return
  if (lastTimestamp !== null) {
    const deltaMs = timestamp - lastTimestamp
    const currentSpeed = syncSpotify.value ? 1 : speed.value
    
    // Do not advance local timer if waiting for Spotify play API to resolve
    if (!isWaitingForSpotify) {
      currentTime.value += (deltaMs / 1000) * currentSpeed
    }
    
    if (!syncSpotify.value && currentTime.value >= totalDuration.value) {
      currentTime.value = totalDuration.value
      playing.value = false
      lastTimestamp = null
      return
    }
  }
  lastTimestamp = timestamp
  updateCurrentLine()
  rafId = requestAnimationFrame(tick)
}

function startPlayback() {
  if (playing.value) return
  playing.value = true
  lastTimestamp = null
  
  if (syncSpotify.value) {
    isWaitingForSpotify = true
    startSpotifyPlayback()
  } else {
    isWaitingForSpotify = false
  }
  
  rafId = requestAnimationFrame(tick)
}

function stopPlayback() {
  playing.value = false
  lastTimestamp = null
  if (rafId) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
  if (syncSpotify.value) {
    pauseSpotify()
  }
}

function togglePlayback() {
  if (playing.value) {
    stopPlayback()
  } else {
    if (currentTime.value >= totalDuration.value) {
      currentTime.value = 0
      currentLineIndex.value = -1
    }
    startPlayback()
  }
}

function handleWrapperClick() {
  if (showSettings.value) {
    showSettings.value = false
    return
  }
  togglePlayback()
}

// --- Line tracking ---
const trackRef = ref(null)

function updateCurrentLine() {
  const lines = parsedLines.value
  const t = currentTime.value
  let idx = -1
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].time <= t) {
      idx = i
      break
    }
  }
  
  // Hysteresis: Prevent the active line highlighting from flashing backwards 
  // during 150ms network polling micro-jitter
  if (idx !== -1 && idx < currentLineIndex.value && currentLineIndex.value < lines.length) {
    const timeOfCurrentLine = lines[currentLineIndex.value].time
    if (t > timeOfCurrentLine - 0.3) {
      idx = currentLineIndex.value
    }
  }

  if (idx !== currentLineIndex.value) {
    currentLineIndex.value = idx
    if (!smoothMode.value) {
      scrollToLine(idx)
    }
  }
  
  if (smoothMode.value) {
    applySmoothScroll()
  }
}

function applySmoothScroll() {
  if (!scrollRef.value || !trackRef.value) return
  const lines = parsedLines.value
  const t = currentTime.value
  
  // Find strictly the next line we are animating towards
  let nextIdx = lines.findIndex(l => l.time > t)
  if (nextIdx === -1) {
    // We are past the last line, scroll to the bottom naturally
    const lastLineEl = trackRef.value.querySelectorAll('.karaoke-line:not(.karaoke-count-in)')[lines.length - 1]
    if (lastLineEl) {
      trackRef.value.style.transform = `translateY(${-(Math.max(0, lastLineEl.offsetTop - window.innerHeight / 2))}px)`
    }
    return
  }
  
  const currentIdx = Math.max(0, nextIdx - 1)
  const lineEls = trackRef.value.querySelectorAll('.karaoke-line:not(.karaoke-count-in)')
  if (!lineEls[currentIdx] || !lineEls[nextIdx]) return
  
  const y1 = lineEls[currentIdx].offsetTop
  const y2 = lineEls[nextIdx].offsetTop
  const t1 = lines[currentIdx].time
  const t2 = lines[nextIdx].time
  
  // Progress between the two lines
  const progress = Math.max(0, Math.min(1, (t - t1) / Math.max(0.001, t2 - t1)))
  
  // Physical interpolated location
  let targetY = y1 + (y2 - y1) * progress
  
  // Center on screen
  targetY -= scrollRef.value.clientHeight / 2
  
  // Apply subpixel 60fps translation
  trackRef.value.style.transform = `translateY(${-(Math.max(0, targetY))}px)`
}

function scrollToLine(idx) {
  if (!scrollRef.value) return
  if (idx < 0) {
    scrollRef.value.scrollTo({ top: 0, behavior: 'smooth' })
    return
  }
  const lineEls = scrollRef.value.querySelectorAll('.karaoke-line:not(.karaoke-count-in)')
  if (!lineEls[idx]) return
  lineEls[idx].scrollIntoView({ behavior: 'smooth', block: 'center' })
}

// --- Seeking ---
function seekToLine(idx) {
  const lines = parsedLines.value
  if (idx < 0 || idx >= lines.length) return
  currentTime.value = lines[idx].time
  currentLineIndex.value = idx
  scrollToLine(idx)
  if (syncSpotify.value) {
    seekSpotify(lines[idx].time * 1000)
  }
}

function seekFromProgress(e) {
  if (!progressRef.value) return
  const rect = progressRef.value.getBoundingClientRect()
  const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  currentTime.value = pct * totalDuration.value
  updateCurrentLine()
  if (syncSpotify.value) {
    seekSpotify(currentTime.value * 1000)
  }
}

// --- Speed ---
function onSpeedChange(e) {
  speed.value = parseFloat(e.target.value)
}

// --- Time formatting ---
function formatTime(seconds) {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

let sdkPollInterval = null
let isSeeking = false
let seekLockTimeout = null
let lastSdkPosition = -1

async function startSpotifyPlayback() {
  const sp = window.__spotify
  if (!sp?.player || !sp.deviceId || !props.spotifyTrackId) {
    return
  }

  try {
    if (typeof sp.player.activateElement === 'function') {
      await sp.player.activateElement().catch(() => {})
    }

    const targetMs = Math.round(currentTime.value * 1000)
    await api.playSpotify({ 
      trackId: props.spotifyTrackId, 
      deviceId: sp.deviceId,
      positionMs: targetMs
    })

    startSDKPoll()
  } catch (err) {
    console.error('[Karaoke] Spotify playback failed:', err.message)
  }
}

function startSDKPoll() {
  stopSDKPoll()
  lastSdkPosition = -1
  let lastReceivedSdkPosition = -1
  
  sdkPollInterval = setInterval(async () => {
    const sp = window.__spotify
    if (!sp?.player || !syncSpotify.value) {
      stopSDKPoll()
      return
    }
    
    if (isSeeking) return // Ignore state while we wait for seek to apply
    
    try {
      const state = await sp.player.getCurrentState()
      if (!state) return
      
      const activeUri = state.track_window?.current_track?.uri
      const expectedUri = `spotify:track:${props.spotifyTrackId}`
      
      // If Spotify is currently playing a DIFFERENT song, do not sync time
      if (activeUri !== expectedUri) {
        if (playing.value && !state.paused) {
          playing.value = false
        }
        return
      }
      
      const curPos = state.position / 1000
      
      // Prevent looping: if the position abruptly resets to the beginning
      // while we were VERY deep in the song (near the end), forcefully stop.
      if (lastSdkPosition > (totalDuration.value - 10) && curPos < 5 && !state.paused) {
        playing.value = false
        await pauseSpotify()
        
        currentTime.value = totalDuration.value
        updateCurrentLine()
        return
      }
      
      const sdkJumpedWhilePaused = state.paused && lastReceivedSdkPosition >= 0 && Math.abs(curPos - lastReceivedSdkPosition) > 0.5
      lastReceivedSdkPosition = curPos
      
      if (!state.paused || sdkJumpedWhilePaused) {
        lastSdkPosition = curPos
        
        if (isWaitingForSpotify) {
          isWaitingForSpotify = false
          currentTime.value = curPos
          updateCurrentLine()
        } else if (Math.abs(currentTime.value - curPos) > 0.15 || sdkJumpedWhilePaused) {
          currentTime.value = curPos
          updateCurrentLine()
        }
      }
      
      // Absolutely perfectly sync play/pause state unconditionally without killing the buffer wait
      if (!isWaitingForSpotify) {
        if (!state.paused && !playing.value) {
          playing.value = true
          lastTimestamp = null
          if (!rafId) {
            rafId = requestAnimationFrame(tick)
          }
        } else if (state.paused && playing.value) {
          playing.value = false
        }
      }
    } catch {}
  }, 100)
}

function stopSDKPoll() {
  if (sdkPollInterval) {
    clearInterval(sdkPollInterval)
    sdkPollInterval = null
  }
}

async function pauseSpotify() {
  const sp = window.__spotify
  if (sp?.player) {
    try { await sp.player.pause() } catch {}
  }
}

async function seekSpotify(positionMs) {
  const sp = window.__spotify
  if (sp?.player) {
    try {
      if (seekLockTimeout) clearTimeout(seekLockTimeout)
      isSeeking = true
      isWaitingForSpotify = true
      lastSdkPosition = positionMs / 1000 // Prematurely update so loop-detector doesn't misfire
      await sp.player.seek(Math.round(positionMs))
      
      // Keep lock active briefly to let Spotify's internal state catch up
      // avoiding rubber-band snapping forward/backward
      seekLockTimeout = setTimeout(() => {
        isSeeking = false
      }, 600)
    } catch {}
  }
}


// --- Sync toggle watcher ---
watch(syncSpotify, (synced) => {
  if (synced) {
    startSDKPoll()
    if (playing.value) {
      startSpotifyPlayback()
    }
  } else {
    stopSDKPoll()
    pauseSpotify()
  }
})

// --- Reset when lyrics change ---
watch(() => props.syncedLyrics, () => {
  stopPlayback()
  stopSDKPoll()
  currentTime.value = 0
  currentLineIndex.value = -1
  if (syncSpotify.value) {
    startSDKPoll() // keep polling if synced
  }
  nextTick(() => {
    if (scrollRef.value) scrollRef.value.scrollTop = 0
  })
})

// --- Cleanup ---
onUnmounted(() => {
  if (rafId) cancelAnimationFrame(rafId)
  stopSDKPoll()
  if (syncSpotify.value && playing.value) pauseSpotify()
})

defineExpose({
  adjustFontSize,
  resetFont
})
</script>

<style scoped>
.karaoke-wrapper {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg-app);
  cursor: pointer;
}

.karaoke-settings-wrapper {
  position: absolute;
  top: 1rem;
  left: 1.5rem;
  z-index: 100;
}

.karaoke-settings-btn {
  background: none;
  border: none;
  padding: 0.5rem;
  color: var(--text-muted);
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.karaoke-settings-btn:hover {
  color: var(--text-primary);
  background: var(--bg-secondary);
}

.karaoke-settings-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 0.5rem;
  background: var(--bg-dropdown);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 0.5rem;
  width: max-content;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.karaoke-settings-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  border-radius: var(--radius-sm);
  cursor: pointer;
  color: var(--text-primary);
  font-size: 0.9rem;
}

.karaoke-settings-item:hover {
  background: var(--bg-hover);
}

.karaoke-settings-item input[type="checkbox"] {
  width: 1.2rem;
  height: 1.2rem;
  cursor: pointer;
}

.karaoke-scroll {
  flex: 1;
  overflow-x: hidden;
  overflow-y: auto;
  scroll-behavior: smooth;
  padding: 0 2rem;
  mask-image: linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%);
  -webkit-mask-image: linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%);
}

.karaoke-scroll.no-smooth {
  scroll-behavior: auto;
  overflow-y: hidden;
}

.karaoke-spacer { height: 40vh; }

/* --- Line styles --- */
.karaoke-line {
  padding: 0.6rem 0;
  font-family: 'Inter', sans-serif;
  font-weight: 600;
  text-align: center;
  transition: all 0.3s ease;
  cursor: pointer;
  user-select: none;
  color: rgba(255, 255, 255, 0.25);
}

.karaoke-line--smooth {
  color: #ffffff;
  transition: none !important;
}

.karaoke-line--smooth.karaoke-line--active {
  color: #e2e88a; /* Faded yellow */
  text-shadow: none !important;
  transform: none !important;
}

.karaoke-line--smooth.karaoke-line--active .karaoke-instrumental {
  text-shadow: none !important;
}

.karaoke-line:hover { color: rgba(255, 255, 255, 0.5); }

.karaoke-line--active {
  color: #bde65c;
  text-shadow: 0 0 20px rgba(189, 230, 92, 0.4), 0 0 40px rgba(189, 230, 92, 0.15);
  transform: scale(1.02);
}

.karaoke-line--past { color: rgba(72, 220, 240, 0.35); }
.karaoke-line--future { color: rgba(255, 255, 255, 0.25); }

.karaoke-instrumental {
  font-size: 0.7em;
  color: rgba(196, 161, 255, 0.5);
  letter-spacing: 0.2em;
}

.karaoke-line--active .karaoke-instrumental {
  color: #c4a1ff;
  text-shadow: 0 0 15px rgba(196, 161, 255, 0.4);
}

.karaoke-count-in { cursor: default; }

/* --- Controls bar --- */
.karaoke-controls {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.6rem 1.5rem;
  background: rgba(14, 14, 14, 0.95);
  border-top: 1px solid var(--border);
  cursor: default;
}

.karaoke-play-btn {
  background: none;
  border: none;
  color: var(--accent);
  cursor: pointer;
  padding: 0.25rem;
  display: flex;
  align-items: center;
  transition: color 0.15s;
  flex-shrink: 0;
}

.karaoke-play-btn:hover { color: #fff; }

/* Progress bar */
.karaoke-progress-wrap {
  flex: 1;
  cursor: pointer;
  padding: 0.5rem 0;
}

.karaoke-progress-track {
  height: 4px;
  background: var(--border-light);
  border-radius: 2px;
  position: relative;
  overflow: hidden;
}

.karaoke-progress-fill {
  position: absolute;
  top: 0; left: 0;
  height: 100%;
  background: linear-gradient(90deg, #bde65c, #48dcf0);
  border-radius: 2px;
  transition: width 0.1s linear;
}

/* Time */
.karaoke-time {
  font-size: 0.7rem;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  flex-shrink: 0;
  min-width: 5.5rem;
  text-align: center;
}



/* Speed slider */
.karaoke-speed {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-shrink: 0;
  transition: opacity 0.2s;
}

.karaoke-speed.is-disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.karaoke-speed.is-disabled .karaoke-speed-slider {
  cursor: not-allowed;
}

.karaoke-speed.is-disabled .karaoke-speed-slider::-webkit-slider-thumb {
  background: var(--text-dim) !important;
  cursor: not-allowed;
}

.karaoke-speed.is-disabled .karaoke-speed-slider::-moz-range-thumb {
  background: var(--text-dim) !important;
  cursor: not-allowed;
}

.karaoke-speed-slider {
  width: 4.5rem;
  height: 4px;
  -webkit-appearance: none;
  appearance: none;
  background: var(--border-light);
  border-radius: 2px;
  outline: none;
  cursor: pointer;
}

.karaoke-speed-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 12px; height: 12px;
  border-radius: 50%;
  background: var(--accent);
  cursor: pointer;
  border: none;
}

.karaoke-speed-slider::-moz-range-thumb {
  width: 12px; height: 12px;
  border-radius: 50%;
  background: var(--accent);
  cursor: pointer;
  border: none;
}

.karaoke-speed-label {
  font-size: 0.65rem;
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
  min-width: 2.5rem;
  text-align: center;
  white-space: nowrap;
}

/* Spotify sync toggle */
.karaoke-sync-label {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  cursor: pointer;
  flex-shrink: 0;
}

.karaoke-sync-label input[type="checkbox"] {
  accent-color: #1db954;
  width: 0.85rem;
  height: 0.85rem;
  cursor: pointer;
}

.karaoke-sync-icon {
  font-size: 0.9rem;
  color: var(--text-dim);
  transition: color 0.15s;
}

.karaoke-sync-label:has(input:checked) .karaoke-sync-icon {
  color: #1db954;
}
</style>
