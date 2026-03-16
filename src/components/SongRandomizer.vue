<template>
  <div class="overlay-backdrop randomizer-overlay" @mousedown.self="backdropDown = true" @mouseup.self="onBackdropUp">
    <div v-if="landed" class="light-rays"></div>
    <div v-if="landed" class="light-rays light-rays-reverse"></div>
    <div class="randomizer-modal" :class="{ 'modal-hidden': landed }">
      <!-- Close button -->
      <button class="randomizer-close" @click="$emit('close')" title="Close"><MdiIcon :path="mdiClose" :size="18" /></button>

      <!-- Filter dropdown -->
      <div class="randomizer-filter">
        <button class="filter-toggle-btn" @click.stop="showFilterPanel = !showFilterPanel" title="Filters">
          <MdiIcon :path="mdiCog" :size="18" />
        </button>
        <div v-if="showFilterPanel" class="filter-panel" @click.stop>
          <label class="filter-check-item">
            <input type="checkbox" value="unplayed" v-model="activeFilters" />
            <span>Unplayed</span>
          </label>
          <label class="filter-check-item">
            <input type="checkbox" value="fresh" v-model="activeFilters" />
            <span class="filter-label-dot" style="--lc:#e74c3c">Fresh</span>
          </label>
          <label class="filter-check-item">
            <input type="checkbox" value="getting-there" v-model="activeFilters" />
            <span class="filter-label-dot" style="--lc:#f1c40f">Getting There</span>
          </label>
          <label class="filter-check-item">
            <input type="checkbox" value="in-setlist" v-model="activeFilters" />
            <span class="filter-label-dot" style="--lc:#2ecc71">In Setlist</span>
          </label>
        </div>
      </div>

      <!-- Carousel viewport -->
      <div class="carousel-viewport" :class="{ 'overflow-ok': landed }" ref="viewportRef">
        <div
          ref="trackRef"
          class="carousel-track"
          :style="{ transform: `translateX(${trackOffset}px)` }"
        >
          <div
            v-for="(item, i) in renderCards"
            :key="i"
            class="carousel-card"
            :class="{
              'is-winner': landed && i === winnerRenderIndex,
              'is-dimmed': landed && i !== winnerRenderIndex,
            }"
            :style="{ width: (landed && i === winnerRenderIndex ? cardWidth * 2 : cardWidth) + 'px' }"
            @click="landed && i === winnerRenderIndex && $emit('select', item.fav)"
          >
            <!-- Winner celebration layers -->
            <template v-if="landed && i === winnerRenderIndex">
              <div class="shimmer-overlay"></div>
              <div class="noise-overlay"></div>
            </template>
            <div class="carousel-card-inner">
              <img v-if="item.albumArt" :src="item.albumArt" class="carousel-card-art" alt="" />
              <div class="carousel-card-text">
                <span class="carousel-card-artist">{{ item.artist }}</span>
                <span class="carousel-card-track">{{ item.track }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Placeholder card before first spin -->
      <div v-if="!isSpinning && !landed" class="placeholder-card-wrap">
        <div class="carousel-card placeholder-card" :style="{ width: cardWidth + 'px' }">
          <div class="carousel-card-inner">
            <img src="/SloshRat.png" class="carousel-card-art placeholder-art" alt="" />
            <div class="carousel-card-text">
              <span class="carousel-card-artist">Slosh's Revenge</span>
              <span class="carousel-card-track">Randomize This!</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Spin / Spin Again button -->
      <button
        v-if="!landed"
        class="spin-btn"
        @mousedown="onSpinBtnDown"
        @mouseup="onSpinBtnUp"
        @click="onSpinClick"
        :disabled="isSpinning || filteredFavorites.length < 2"
      >
        SPIN
      </button>
      <button
        v-else
        class="spin-btn spin-again-btn"
        @click="onSpinClick"
      >
        SPIN AGAIN
      </button>
    </div>

    <!-- Full-screen celebration layer -->
    <div v-if="landed" class="celebration-fullscreen">
      <div class="glow-star glow-star-1"></div>
      <div class="glow-star glow-star-2"></div>
      <div class="glow-star glow-star-3"></div>
      <div class="glow-star glow-star-4"></div>
      <div class="glow-star glow-star-5"></div>
      <div class="glow-star glow-star-6"></div>
      <div class="glow-star glow-star-7"></div>
      <div class="glow-star glow-star-8"></div>
      <div class="glow-star glow-star-9"></div>
      <div class="glow-star glow-star-10"></div>
      <div class="glow-star glow-star-11"></div>
      <div class="glow-star glow-star-12"></div>
      <div class="glow-star glow-star-13"></div>
      <div class="glow-star glow-star-14"></div>
      <div class="firework firework-1"></div>
      <div class="firework firework-2"></div>
      <div class="firework firework-3"></div>
      <div class="firework firework-4"></div>
    </div>

    <!-- Confetti canvas (full-screen, above everything) -->
    <canvas ref="confettiCanvas" class="confetti-canvas"></canvas>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useEventListener } from '@vueuse/core'
import MdiIcon from './MdiIcon.vue'
import { mdiClose, mdiCog } from '@mdi/js'
import confettiModule from 'canvas-confetti'

const props = defineProps({
  favorites: { type: Array, required: true },
})

const emit = defineEmits(['close', 'select'])

const viewportRef = ref(null)
const trackRef = ref(null)
const confettiCanvas = ref(null)
let fireConfetti = null
const cardWidth = 200
const cardGap = 12
const cardStep = cardWidth + cardGap
const BUFFER_CARDS = 60
/* Spotify state lives on window so it survives component unmount/remount */
const _sp = window.__spotify || (window.__spotify = { api: null, ctrl: null, ready: false })

if (!_sp._init) {
  _sp._init = true
  window.onSpotifyIframeApiReady = (IFrameAPI) => { _sp.api = IFrameAPI }
  if (!document.querySelector('script[src*="spotify.com/embed/iframe-api"]')) {
    const s = document.createElement('script')
    s.src = 'https://open.spotify.com/embed/iframe-api/v1'
    s.async = true
    document.body.appendChild(s)
  }
}
const spotifyId = ref(null)

const shuffled = ref([])

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

import { splitTitle } from '../utils/titleParser.js'

const activeFilters = ref(['unplayed'])
const showFilterPanel = ref(false)

const filteredFavorites = computed(() => {
  if (!activeFilters.value.length) return props.favorites
  let list = props.favorites
  const filters = activeFilters.value

  // Apply unplayed filter
  if (filters.includes('unplayed')) {
    list = list.filter(f => !f.played)
  }

  // Apply label filters (OR logic — match any selected label)
  const labelFilters = filters.filter(f => f !== 'unplayed')
  if (labelFilters.length) {
    list = list.filter(f => labelFilters.includes(f.label || 'fresh'))
  }

  return list.length >= 2 ? list : props.favorites
})

// Shuffle bag: track recently picked songs, reset daily
const recentWinners = new Set()
let recentWinnersDate = new Date().toDateString()

function checkDailyReset() {
  const today = new Date().toDateString()
  if (today !== recentWinnersDate) {
    recentWinners.clear()
    recentWinnersDate = today
  }
}

function reshuffleCards() {
  checkDailyReset()
  // Exclude recent winners from the pool
  let pool = filteredFavorites.value.filter(f => !recentWinners.has(f.title))
  // If all songs have been picked, reset the bag
  if (pool.length < 2) {
    recentWinners.clear()
    pool = filteredFavorites.value
  }
  shuffled.value = shuffle(pool)
}

watch(activeFilters, () => {
  showFilterPanel.value = false
  landed.value = false
  winnerRenderIndex.value = -1
  reshuffleCards()
  nextTick(() => {
    trackOffset.value = getOffsetForCardIndex(2)
  })
}, { deep: true })

const renderCards = computed(() => {
  if (!shuffled.value.length) return []
  const cards = []
  for (let i = 0; i < BUFFER_CARDS; i++) {
    const fav = shuffled.value[i % shuffled.value.length]
    const { artist, track } = splitTitle(fav.title)
    cards.push({ fav, artist, track, title: fav.title, albumArt: fav.albumArt || null })
  }
  return cards
})

// Animation state
const trackOffset = ref(0)
const isSpinning = ref(false)
const landed = ref(false)
const winnerRenderIndex = ref(-1)

const winnerFav = computed(() => {
  if (!landed.value || winnerRenderIndex.value < 0) return null
  return renderCards.value[winnerRenderIndex.value]?.fav || null
})
const winnerArtist = computed(() => {
  if (!winnerFav.value) return ''
  const sep = winnerFav.value.title.indexOf(' — ')
  return sep >= 0 ? winnerFav.value.title.substring(0, sep) : ''
})
const winnerTrack = computed(() => {
  if (!winnerFav.value) return ''
  const sep = winnerFav.value.title.indexOf(' — ')
  return sep >= 0 ? winnerFav.value.title.substring(sep + 3) : winnerFav.value.title
})

let animFrame = null

let confettiInterval = null
let lastCenterCardIdx = -1
let audioCtx = null
let spotifyPlayTriggered = false

function getAudioCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  }
  return audioCtx
}

function ensureAudioResumed() {
  const ctx = getAudioCtx()
  if (ctx.state === 'suspended') return ctx.resume()
  return Promise.resolve()
}

function playTick() {
  const ctx = getAudioCtx()
  if (ctx.state !== 'running') return
  try {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.value = 1200 + Math.random() * 400
    gain.gain.setValueAtTime(0.08, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.04)
  } catch {}
}

let impactBuffer = null

function playImpact() {
  const ctx = getAudioCtx()
  if (ctx.state !== 'running' || !impactBuffer) return
  try {
    const src = ctx.createBufferSource()
    const gain = ctx.createGain()
    src.buffer = impactBuffer
    gain.gain.value = 0.5
    src.connect(gain)
    gain.connect(ctx.destination)
    src.start()
  } catch {}
}

function onSpinBtnDown() {
  ensureAudioResumed().then(() => playTick())
}

function onSpinBtnUp() {
  playTick()
}



function centerOffset() {
  const vw = viewportRef.value?.clientWidth || 800
  return vw / 2 - cardWidth / 2
}

function getOffsetForCardIndex(idx) {
  return centerOffset() - idx * cardStep
}

function onSpinClick() {
  if (isSpinning.value) return
  preloadImpactSound()

  landed.value = false
  if (land._resizeHandler) {
    window.removeEventListener('resize', land._resizeHandler)
    land._resizeHandler = null
  }
  if (land._holoFrame) {
    cancelAnimationFrame(land._holoFrame)
    land._holoFrame = null
  }
  // Clear inline styles from previous winner
  const prevWinner = document.querySelector('.carousel-card.is-winner')
  if (prevWinner) {
    prevWinner.style.transform = ''
    prevWinner.style.borderColor = ''
    prevWinner.style.filter = ''
  }
  winnerRenderIndex.value = -1
  spotifyId.value = null
  if (_sp.ctrl) { try { _sp.ctrl.pause() } catch {} }
  if (confettiInterval) { clearInterval(confettiInterval); confettiInterval = null }
  if (fireConfetti) { fireConfetti.reset() }
  reshuffleCards()

  nextTick(() => {
    // Start centered on card index 2 (so 2 cards visible on each side)
    const startIdx = 2
    trackOffset.value = getOffsetForCardIndex(startIdx)

    // Pick a random target deep in the buffer
    const minTarget = Math.floor(BUFFER_CARDS * 0.4)
    const maxTarget = BUFFER_CARDS - 4
    const targetIdx = minTarget + Math.floor(Math.random() * (maxTarget - minTarget))
    const targetOffset = getOffsetForCardIndex(targetIdx)

    isSpinning.value = true

    lastCenterCardIdx = startIdx

    /* Preload Spotify: we already know which card will win */
    const RICKROLL_CHANCE = 0.02 // 2% easter egg, max once per month
    const rrKey = 'lyricmachine_rr'
    const rrMonth = new Date().getFullYear() + '-' + (new Date().getMonth() + 1)
    const lastRR = localStorage.getItem(rrKey)
    const isRickroll = lastRR !== rrMonth && Math.random() < RICKROLL_CHANCE
    const winnerCard = renderCards.value[targetIdx]
    if (isRickroll && _sp.ctrl) {
      spotifyId.value = '4cOdK2wGLETKBW3PvgPWqT'
      preloadSpotifyTrack('4cOdK2wGLETKBW3PvgPWqT')
      localStorage.setItem(rrKey, rrMonth)
    } else if (winnerCard) {
      const { artist, track, title } = winnerCard
      // Check if we already have a cached Spotify ID in favorites
      const cachedFav = props.favorites.find(f => f.title === title)
      if (cachedFav?.spotifyTrackId) {
        spotifyId.value = cachedFav.spotifyTrackId
        preloadSpotifyTrack(cachedFav.spotifyTrackId)
      } else if (artist && track) {
        fetch(`/api/spotify-id?artist=${encodeURIComponent(artist)}&track=${encodeURIComponent(track)}`)
          .then(r => r.ok ? r.json() : null)
          .then(d => {
            if (d?.spotifyTrackId) {
              spotifyId.value = d.spotifyTrackId
              preloadSpotifyTrack(d.spotifyTrackId)
              // Cache to favorites
              const favs = props.favorites
              const f = favs.find(fv => fv.title === winnerCard.title)
              if (f) {
                f.spotifyTrackId = d.spotifyTrackId
                if (d.albumArt) f.albumArt = d.albumArt
              }
            }
          })
          .catch(() => {})
      }
    }

    const startTime = performance.now()
    const duration = 3500 + Math.random() * 1500
    const startOffset = trackOffset.value
    spotifyPlayTriggered = false

    // One last tick 250ms before landing
    setTimeout(() => playTick(), duration - 100)

    function animate(now) {
      const elapsed = now - startTime
      let progress = Math.min(elapsed / duration, 1)



      // --- TUNABLE BOUNCE PARAMS ---
      const overshootPx = 75   // how far past center in pixels
      const bounceBackMs = 300 // how fast the bounce-back is in milliseconds

      // Phase 1: cubic ease-out toward overshoot point
      const overshootTarget = targetOffset - overshootPx
      const eased = 1 - Math.pow(1 - progress, 3)
      const currentOffset = startOffset + (overshootTarget - startOffset) * eased
      if (trackRef.value) trackRef.value.style.transform = `translateX(${currentOffset}px)`

      /* Tick sound when a new card crosses center */
      const currentCenterIdx = Math.round((centerOffset() - currentOffset) / cardStep)
      if (currentCenterIdx !== lastCenterCardIdx) {
        lastCenterCardIdx = currentCenterIdx
        playTick()
      }

      if (progress < 1) {
        /* Start Spotify 0.5s before landing */
        const remaining = duration - elapsed
        if (!spotifyPlayTriggered && remaining <= 10 && _sp.ctrl && _sp.ready) {
          spotifyPlayTriggered = true
          _sp.ctrl.play()
        }
        animFrame = requestAnimationFrame(animate)
      } else {
        // Phase 2: ease back from overshoot to center
        winnerRenderIndex.value = targetIdx
        const bounceStart = performance.now()
        function bounceBack(now) {
          const bt = Math.min((now - bounceStart) / bounceBackMs, 1)
          const be = 1 - Math.pow(1 - bt, 2) // ease-out quad
          const bounceOffset = overshootTarget + (targetOffset - overshootTarget) * be
          if (trackRef.value) trackRef.value.style.transform = `translateX(${bounceOffset}px)`
          if (bt < 1) {
            animFrame = requestAnimationFrame(bounceBack)
          } else {
            trackOffset.value = targetOffset
            land()
          }
        }
        animFrame = requestAnimationFrame(bounceBack)
      }
    }

    animFrame = requestAnimationFrame(animate)
  })
}

function land() {
  isSpinning.value = false
  playImpact()

  // PRE-COMPUTE centered position BEFORE setting landed
  // so the card is already at the right spot when Vue updates the DOM
  function recenterWinner() {
    const screenCenter = window.innerWidth / 2 - cardWidth / 2
    const winnerPos = winnerRenderIndex.value * cardStep
    trackOffset.value = screenCenter - winnerPos
  }
  recenterWinner()          // set position FIRST
  landed.value = true       // THEN trigger DOM update

  // Record this win in the shuffle bag
  const winnerCard = renderCards.value[winnerRenderIndex.value]
  if (winnerCard) recentWinners.add(winnerCard.title)

  window.addEventListener('resize', recenterWinner)
  land._resizeHandler = recenterWinner

  // Drive holographic shimmer + 3D tilt (no delay needed)
  const FLOAT_DURATION = 8000
  const startTime = performance.now()
  let holoFrame = null

  function updateHolo() {
    const elapsed = performance.now() - startTime

    // Get winner element for transform updates
    const winnerEl = document.querySelector('.carousel-card.is-winner')

    // Smooth Lissajous motion — sine waves with ramp-in for seamless spin transition
    const t = elapsed / 1000
    const rawRamp = Math.min(t / 2, 1)
    const ramp = rawRamp * rawRamp * (3 - 2 * rawRamp) // smoothstep ease-in
    const ry = (Math.sin(t * 0.8) * 15 + Math.sin(t * 0.29) * 6) * ramp
    const rx = (Math.sin(t * 0.57 + 1.2) * 6 + Math.sin(t * 0.21) * 3) * ramp

    // Apply card tilt (no scale — card is physically 400px)
    // During first 500ms, add a 360° flat spin (rotateZ) for the zoom entrance
    if (winnerEl) {
      const SPIN_DURATION = 1000
      const spinElapsed = performance.now() - startTime
      let rz = 0
      if (spinElapsed < SPIN_DURATION) {
        const sp = spinElapsed / SPIN_DURATION
        rz = 360 * (1 - Math.pow(1 - sp, 3)) // ease-out cubic
      }
      winnerEl.style.transform = `perspective(600px) rotateY(${ry}deg) rotateX(${rx}deg) rotateZ(${rz}deg)`

      // Edge lighting — border brightens on the "lit" side
      const lb = (0.55 + ry / 70).toFixed(2)
      const rb = (0.55 - ry / 70).toFixed(2)
      const tb = (0.55 - rx / 30).toFixed(2)
      const bb = (0.55 + rx / 30).toFixed(2)
      winnerEl.style.borderColor = `rgba(245,197,66,${tb}) rgba(245,197,66,${rb}) rgba(245,197,66,${bb}) rgba(245,197,66,${lb})`
    }

    // Apply shimmer position (same values = perfect sync)
    const holoX = 50 + ry * 1.5
    const holoY = 50 + rx * 2
    const els = document.querySelectorAll('.shimmer-overlay')
    for (const el of els) {
      el.style.setProperty('--holo-x', holoX + '%')
      el.style.setProperty('--holo-y', holoY + '%')
    }
    holoFrame = requestAnimationFrame(updateHolo)
  }
  holoFrame = requestAnimationFrame(updateHolo)
  land._holoFrame = holoFrame

  /* Play Spotify only if the winner's track was actually preloaded */
  if (!spotifyPlayTriggered && _sp.ctrl && _sp.ready && spotifyId.value) {
    _sp.ctrl.play()
  }

  if (!fireConfetti) return

  const goldColors = ['#f5c542', '#ffd700', '#ffec8b', '#fff8dc', '#ffffff']

  /* Wave 1: big center burst */
  fireConfetti({
    particleCount: 150,
    spread: 100,
    origin: { y: 0.5, x: 0.5 },
    colors: goldColors,
    shapes: ['star', 'circle'],
    scalar: 1.3,
    startVelocity: 45,
  })

  fireConfetti({ particleCount: 80, angle: 60,  spread: 60, origin: { y: 0.65, x: 0 },    colors: goldColors, shapes: ['star'], startVelocity: 55 })
  fireConfetti({ particleCount: 80, angle: 120, spread: 60, origin: { y: 0.65, x: 1 },    colors: goldColors, shapes: ['star'], startVelocity: 55 })
  fireConfetti({ particleCount: 50, angle: 135, spread: 50, origin: { y: 0, x: 0 },       colors: goldColors, gravity: 1.2 })
  fireConfetti({ particleCount: 50, angle: 45,  spread: 50, origin: { y: 0, x: 1 },       colors: goldColors, gravity: 1.2 })
  fireConfetti({ particleCount: 60, spread: 160, origin: { y: 0.5, x: 0.5 }, colors: goldColors, shapes: ['star'], scalar: 0.9, startVelocity: 35 })
  fireConfetti({ particleCount: 40, angle: 60,  spread: 80, origin: { y: 1, x: 0.15 }, colors: goldColors, startVelocity: 50 })
  fireConfetti({ particleCount: 40, angle: 120, spread: 80, origin: { y: 1, x: 0.85 }, colors: goldColors, startVelocity: 50 })
  fireConfetti({ particleCount: 300, spread: 360, origin: { y: 0.5, x: 0.5 }, colors: goldColors, gravity: 0, scalar: 1, startVelocity: 20, drift: 0, ticks: 600000, decay: 0.97 })

}

function warmUpSpotifyEmbed() {
  if (_sp.ctrl) return  /* already warm */

  /* Create hidden wrapper */
  const old = document.getElementById('randomizer-spotify-wrap')
  if (old) old.remove()

  const wrapper = document.createElement('div')
  wrapper.id = 'randomizer-spotify-wrap'
  wrapper.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:9999;width:300px;border-radius:12px;overflow:hidden;visibility:hidden;'
  document.body.appendChild(wrapper)

  const el = document.createElement('div')
  wrapper.appendChild(el)

  function doWarmUp(IFrameAPI) {
    /* Use a well-known track just to initialize the iframe — it won't play */
    IFrameAPI.createController(el, {
      uri: 'spotify:track:4cOdK2wGLETKBW3PvgPWqT',
      width: 300,
      height: 80,
    }, (controller) => {
      _sp.ctrl = controller
      _sp.warm = true
    })
  }

  if (_sp.api) {
    doWarmUp(_sp.api)
  } else {
    window.onSpotifyIframeApiReady = (IFrameAPI) => {
      _sp.api = IFrameAPI
      doWarmUp(IFrameAPI)
    }
  }
}

function preloadSpotifyTrack(trackId) {
  const uri = `spotify:track:${trackId}`
  _sp.ready = false

  if (_sp.ctrl) {
    /* Controller is warm — just swap the track (never played, so no auto-play) */
    _sp.ctrl.loadUri(uri)
    _sp.ctrl.addListener('ready', () => {
      _sp.ready = true
      if (landed.value) {
        _sp.ctrl.play()
      }
    })
    return
  }

  /* Fallback: create from scratch if warm-up didn't finish */
  const old = document.getElementById('randomizer-spotify-wrap')
  if (old) old.remove()

  const wrapper = document.createElement('div')
  wrapper.id = 'randomizer-spotify-wrap'
  wrapper.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:9999;width:300px;border-radius:12px;overflow:hidden;visibility:hidden;'
  document.body.appendChild(wrapper)

  const el = document.createElement('div')
  wrapper.appendChild(el)

  function createEmbed(IFrameAPI) {
    IFrameAPI.createController(el, {
      uri,
      width: 300,
      height: 80,
    }, (controller) => {
      _sp.ctrl = controller
      controller.addListener('ready', () => {
        _sp.ready = true
        if (landed.value) {
          controller.play()
        }
      })
    })
  }

  if (_sp.api) {
    createEmbed(_sp.api)
  } else {
    window.onSpotifyIframeApiReady = (IFrameAPI) => {
      _sp.api = IFrameAPI
      createEmbed(IFrameAPI)
    }
  }
}

const backdropDown = ref(false)
function onBackdropUp() {
  if (backdropDown.value) emit('close')
  backdropDown.value = false
}

function closeFilterPanel() { showFilterPanel.value = false }

function onKeydown(e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
  if (e.key === ' ') {
    e.preventDefault()
    e.stopPropagation()
    if (!isSpinning.value && filteredFavorites.value.length >= 2) {
      ensureAudioResumed().then(() => playTick())
      onSpinClick()
    }
  } else if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    emit('close')
  } else if (e.key === 'Enter' && landed.value && winnerRenderIndex.value >= 0) {
    e.preventDefault()
    e.stopPropagation()
    emit('select', renderCards.value[winnerRenderIndex.value].fav)
  }
}

// Preload impact sound lazily (AudioContext needs user gesture)
function preloadImpactSound() {
  if (impactBuffer) return
  fetch('/special.ogg')
    .then(r => r.arrayBuffer())
    .then(buf => getAudioCtx().decodeAudioData(buf))
    .then(decoded => { impactBuffer = decoded })
    .catch(() => {})
}

useEventListener(document, 'click', closeFilterPanel)
useEventListener(document, 'keydown', onKeydown, true)

onMounted(() => {
  reshuffleCards()

  // Warm up Spotify embed so it's ready by spin time
  warmUpSpotifyEmbed()

  // Create confetti instance bound to our canvas
  if (confettiCanvas.value) {
    confettiCanvas.value.width = confettiCanvas.value.offsetWidth
    confettiCanvas.value.height = confettiCanvas.value.offsetHeight
    fireConfetti = confettiModule.create(confettiCanvas.value, { resize: true })
  }

  nextTick(() => {
    trackOffset.value = getOffsetForCardIndex(2)
  })
})

onUnmounted(() => {
  if (animFrame) cancelAnimationFrame(animFrame)
  if (confettiInterval) clearInterval(confettiInterval)
  if (fireConfetti) fireConfetti.reset()
  /* Fully destroy spotify to ensure clean warm-up on next open */
  if (_sp.ctrl) {
    try { _sp.ctrl.destroy() } catch {}
    _sp.ctrl = null
  }
  _sp.ready = false
  _sp.warm = false
  const wrap = document.getElementById('randomizer-spotify-wrap')
  if (wrap) wrap.remove()
})
</script>

<style scoped>
.randomizer-modal {
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  width: min(92vw, 920px);
  padding: 2.5rem 0 2rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2rem;
  position: relative;
  overflow: hidden;
}

.randomizer-modal.modal-hidden {
  background: transparent;
  border-color: transparent;
  overflow: visible;
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  max-width: none;
  border-radius: 0;
  padding: 0;
  justify-content: center;
  pointer-events: none;
  z-index: 10;
}

.randomizer-modal.modal-hidden .carousel-card.is-winner,
.randomizer-modal.modal-hidden .spin-btn {
  pointer-events: auto;
}

.randomizer-modal.modal-hidden .randomizer-close,
.randomizer-modal.modal-hidden .randomizer-filter,
.randomizer-modal.modal-hidden .placeholder-card-wrap,
.randomizer-modal.modal-hidden .carousel-viewport::before,
.randomizer-modal.modal-hidden .carousel-viewport::after {
  opacity: 0;
  pointer-events: none;
}

.randomizer-modal.modal-hidden .spin-btn {
  position: absolute;
  bottom: 6rem;
  left: 50%;
  transform: translateX(-50%);
}

.spin-again-btn {
  border-color: #f5c542 !important;
  color: #f5c542 !important;
}

.randomizer-close {
  position: absolute;
  top: 0.75rem;
  right: 1rem;
  background: none;
  border: none;
  color: var(--text-faint);
  font-size: 1.1rem;
  cursor: pointer;
  padding: 0.2rem 0.5rem;
  transition: color var(--speed-fast);
  z-index: 2;
}

.randomizer-close:hover {
  color: var(--text-muted);
}

/* Filter dropdown */
.randomizer-filter {
  position: absolute;
  top: 0.75rem;
  left: 1rem;
  z-index: 10;
}

.filter-toggle-btn {
  background: none;
  border: none;
  color: var(--text-faint);
  cursor: pointer;
  padding: 0.2rem 0.5rem;
  transition: color var(--speed-fast);
}

.filter-toggle-btn:hover {
  color: var(--text-muted);
}

.filter-panel {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: var(--space-sm);
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-md) 0;
  z-index: 20;
  min-width: 160px;
}

.filter-check-item {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: var(--space-md) var(--space-lg);
  cursor: pointer;
  font-size: var(--font-sm);
  color: #ccc;
  transition: background var(--speed-fast);
}

.filter-check-item:hover {
  background: var(--bg-hover-subtle);
}

.filter-check-item input[type="checkbox"] {
  accent-color: var(--color-teal);
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.filter-label-dot::before {
  content: '';
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--lc);
  margin-right: 4px;
}

/* Carousel */
.carousel-viewport {
  width: 100%;
  overflow: hidden;
  position: relative;
  padding: 4rem 0;
}

.carousel-viewport.overflow-ok {
  overflow: visible;
  z-index: 15;
}

.carousel-viewport::before,
.carousel-viewport::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  width: 15%;
  z-index: 3;
  pointer-events: none;
}

.carousel-viewport::before {
  left: 0;
  background: linear-gradient(to right, #111, transparent);
}

.carousel-viewport::after {
  right: 0;
  background: linear-gradient(to left, #111, transparent);
}

.carousel-track {
  display: flex;
  gap: 12px;
  transform: translateZ(0);
  will-change: transform;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  align-items: center;
}

.carousel-card {
  flex-shrink: 0;
  border-radius: 10px;
  background: #1a1a1a;
  border: 1px solid #2a2a2a;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: default;
  user-select: none;
  overflow: hidden;
  transition: width 1s cubic-bezier(0.34, 1.56, 0.64, 1), margin 1s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.carousel-card.is-winner {
  border-color: #f5c542;
  background: linear-gradient(135deg, #1e1a0e 0%, #2a1f08 50%, #1e1a0e 100%);
  cursor: pointer;
  z-index: 2;
  position: relative;
  overflow: visible;
  box-shadow: 0 0 24px rgba(245, 197, 66, 0.25), 0 0 60px rgba(245, 197, 66, 0.05), 0 20px 60px rgba(0, 0, 0, 0.7);
  margin-left: -100px;
  margin-right: -100px;
}

.carousel-card.is-winner:hover {
  box-shadow: 0 0 50px rgba(245, 197, 66, 0.5);
}

.carousel-card.is-dimmed {
  opacity: 0;
  visibility: hidden;
}

.is-winner .carousel-card-artist {
  font-size: 1.4rem;
}

.is-winner .carousel-card-track {
  font-size: 1.8rem;
}

/* Noise texture overlay */
.noise-overlay {
  position: absolute;
  inset: 0;
  border-radius: 10px;
  pointer-events: none;
  z-index: 5;
  opacity: 0.04;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  background-size: cover;
  mix-blend-mode: overlay;
}



/* Shimmer sweep */
.shimmer-overlay {
  position: absolute;
  inset: 0;
  border-radius: 10px;
  pointer-events: none;
  z-index: 3;
  mix-blend-mode: color-dodge;
  opacity: 0.6;
  background:
    linear-gradient(105deg, transparent 40%, rgba(255, 219, 112, 0.4) 45%, rgba(194, 153, 255, 0.3) 50%, transparent 54%),
    linear-gradient(-25deg, transparent 30%, rgba(184, 255, 252, 0.4) 40%, rgba(255, 184, 224, 0.3) 50%, transparent 60%),
    radial-gradient(circle at bottom left, rgba(170, 255, 243, 0.35) 0%, transparent 50%);
  background-size: 250% 250%;
  background-position: var(--holo-x, 50%) var(--holo-y, 50%);
}

/* Pulse ring */
.pulse-ring {
  position: absolute;
  inset: -8px;
  border-radius: 16px;
  border: 2px solid rgba(245, 197, 66, 0.4);
  pointer-events: none;
  z-index: 1;
  animation: pulseExpand 2s ease-out infinite;
}

@keyframes pulseExpand {
  0% { inset: -4px; opacity: 0.8; border-color: rgba(245, 197, 66, 0.6); }
  100% { inset: -20px; opacity: 0; border-color: rgba(245, 197, 66, 0); }
}

/* Animated stars */
.star {
  position: absolute;
  color: #f5c542;
  pointer-events: none;
  z-index: 4;
  font-size: 1rem;
  filter: drop-shadow(0 0 4px rgba(245, 197, 66, 0.8));
}

.star-1 {
  top: -16px;
  left: 10%;
  animation: starFloat1 3s ease-in-out infinite, starTwinkle 1.5s ease-in-out infinite;
}

.star-2 {
  top: -12px;
  right: 15%;
  font-size: 0.7rem;
  animation: starFloat2 2.5s ease-in-out infinite 0.3s, starTwinkle 1.2s ease-in-out infinite 0.5s;
}

.star-3 {
  bottom: -14px;
  left: 20%;
  font-size: 0.8rem;
  animation: starFloat3 2.8s ease-in-out infinite 0.6s, starTwinkle 1.8s ease-in-out infinite 0.2s;
}

.star-4 {
  bottom: -10px;
  right: 10%;
  font-size: 0.6rem;
  animation: starFloat1 3.2s ease-in-out infinite 0.9s, starTwinkle 1.4s ease-in-out infinite 0.7s;
}

.star-5 {
  top: 50%;
  left: -14px;
  font-size: 0.7rem;
  animation: starFloat2 2.6s ease-in-out infinite 0.4s, starTwinkle 1.6s ease-in-out infinite;
}

.star-6 {
  top: 40%;
  right: -14px;
  font-size: 0.9rem;
  animation: starFloat3 3s ease-in-out infinite 0.2s, starTwinkle 1.3s ease-in-out infinite 0.8s;
}

@keyframes starFloat1 {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  50% { transform: translateY(-8px) rotate(20deg); }
}

@keyframes starFloat2 {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  50% { transform: translateY(-6px) rotate(-15deg); }
}

@keyframes starFloat3 {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  50% { transform: translateY(-10px) rotate(25deg); }
}

@keyframes starTwinkle {
  0%, 100% { opacity: 1; filter: drop-shadow(0 0 4px rgba(245, 197, 66, 0.8)); }
  50% { opacity: 0.4; filter: drop-shadow(0 0 8px rgba(245, 197, 66, 1)); }
}

/* Sparkles that pop outward */
.sparkle {
  position: absolute;
  color: #fff;
  pointer-events: none;
  z-index: 4;
  font-size: 0.6rem;
  opacity: 0;
}

.sparkle-1 {
  top: -6px;
  left: 50%;
  animation: sparkleBurst 2s ease-out infinite;
}

.sparkle-2 {
  bottom: -6px;
  left: 50%;
  animation: sparkleBurst 2s ease-out infinite 0.5s;
}

.sparkle-3 {
  top: 50%;
  left: -6px;
  animation: sparkleBurst 2s ease-out infinite 1s;
}

.sparkle-4 {
  top: 50%;
  right: -6px;
  animation: sparkleBurst 2s ease-out infinite 1.5s;
}

@keyframes sparkleBurst {
  0% { opacity: 0; transform: scale(0.5) translate(0, 0); }
  20% { opacity: 1; transform: scale(1.2); }
  100% { opacity: 0; transform: scale(0.3) translate(0, -12px); }
}

.carousel-card-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
  padding: 15px;
  min-width: 0;
  width: 100%;
  height: 100%;
}

.carousel-card-art {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 6px;
  object-fit: cover;
  flex-shrink: 0;
  position: relative;
  z-index: 4;
}

.carousel-card-text {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;
  width: 100%;
  text-align: left;
  overflow: hidden;
}

.carousel-card-artist {
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.55);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
  padding-top: 10px;
}

.carousel-card-track {
  font-size: 1.1rem;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.85);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

/* Spin button */
.spin-btn {
  margin-top: auto;
  padding: 0.85rem 3.5rem;
  min-width: 180px;
  font-size: 1.1rem;
  font-weight: 600;
  font-family: inherit;
  letter-spacing: 0.1em;
  background: #1a1a1a;
  color: rgba(255, 255, 255, 0.7);
  border: 1px solid #333;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
}

.spin-btn:hover:not(:disabled) {
  background: #222;
  border-color: #444;
  color: rgba(255, 255, 255, 0.9);
}

.spin-btn:active:not(:disabled) {
  transform: scale(0.97);
}

.spin-btn:disabled {
  opacity: 0.25;
  cursor: not-allowed;
}


.placeholder-card-wrap {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 5;
  pointer-events: none;
  padding-bottom: 3rem;
}

.placeholder-card {
  transform: scale(1.4);
  pointer-events: auto;
  border-color: #f5c542;
  box-shadow: 0 0 24px rgba(245, 197, 66, 0.25), 0 0 60px rgba(245, 197, 66, 0.05), 0px 0px 9px 10px rgb(0 0 0 / 88%);
}

.placeholder-art {
  background: #000;
  object-fit: contain;
}

.confetti-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 1;
}

/* Full-screen celebration effects */
.celebration-fullscreen {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 1;
  overflow: hidden;
}

.light-rays {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 200vmax;
  height: 200vmax;
  transform: translate(-50%, -50%);
  background: repeating-conic-gradient(
    transparent 0deg 10deg,
    rgba(245, 197, 66, 0.12) 10deg 11deg,
    rgba(255, 255, 255, 0.08) 11deg 12deg,
    rgba(245, 197, 66, 0.12) 12deg 13deg,
    transparent 13deg 20deg
  );
  border-radius: 50%;
  mask-image: radial-gradient(circle, #000 0%, transparent 55%);
  -webkit-mask-image: radial-gradient(circle, #000 0%, transparent 55%);
  animation: spinRays 20s linear infinite;
  will-change: transform;
  pointer-events: none;
}

@keyframes spinRays {
  to { transform: translate(-50%, -50%) rotate(1turn); }
}

@keyframes spinRaysReverse {
  to { transform: translate(-50%, -50%) rotate(-1turn); }
}

.light-rays-reverse {
  animation: spinRays 20s linear infinite;
  animation-delay: -1.7s;
  opacity: 0.3;
}


/* Floating glow stars */
.glow-star {
  position: absolute;
  pointer-events: none;
  opacity: 0;
  background: #f5c542;
  clip-path: polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%);
  filter: drop-shadow(0 0 8px rgba(245, 197, 66, 0.8));
}

.glow-star-1 {
  width: 50px; height: 50px;
  top: 12%; left: 8%;
  animation: starDrift1 5s ease-in-out infinite;
}
.glow-star-2 {
  width: 90px; height: 90px;
  top: 55%; right: 6%;
  animation: starDrift2 6s ease-in-out 0.3s infinite;
  background: #ffd700;
}
.glow-star-3 {
  width: 35px; height: 35px;
  top: 30%; right: 22%;
  animation: starDrift1 4.5s ease-in-out 0.6s infinite;
  background: #ffec8b;
}
.glow-star-4 {
  width: 75px; height: 75px;
  bottom: 18%; left: 12%;
  animation: starDrift2 7s ease-in-out 0.9s infinite;
}
.glow-star-5 {
  width: 22px; height: 22px;
  top: 8%; right: 32%;
  animation: starDrift1 5s ease-in-out 0.4s infinite;
  background: #fff8dc;
}
.glow-star-6 {
  width: 60px; height: 60px;
  bottom: 12%; right: 28%;
  animation: starDrift2 5.5s ease-in-out 1.2s infinite;
  background: #ffd700;
}
.glow-star-7 {
  width: 100px; height: 100px;
  top: 5%; left: 35%;
  animation: starDrift2 6.5s ease-in-out 0.2s infinite;
  background: #f5c542;
}
.glow-star-8 {
  width: 18px; height: 18px;
  top: 42%; left: 4%;
  animation: starDrift1 4s ease-in-out 1.5s infinite;
  background: #fff8dc;
}
.glow-star-9 {
  width: 80px; height: 80px;
  bottom: 8%; left: 40%;
  animation: starDrift2 5s ease-in-out 0.7s infinite;
  background: #ffd700;
}
.glow-star-10 {
  width: 28px; height: 28px;
  top: 65%; right: 40%;
  animation: starDrift1 4.8s ease-in-out 1s infinite;
  background: #ffec8b;
}
.glow-star-11 {
  width: 95px; height: 95px;
  top: 20%; right: 5%;
  animation: starDrift2 7.5s ease-in-out 0.5s infinite;
}
.glow-star-12 {
  width: 40px; height: 40px;
  bottom: 30%; right: 12%;
  animation: starDrift1 5.2s ease-in-out 1.8s infinite;
  background: #fff8dc;
}
.glow-star-13 {
  width: 85px; height: 85px;
  bottom: 5%; right: 50%;
  animation: starDrift2 6s ease-in-out 1.4s infinite;
  background: #ffd700;
}
.glow-star-14 {
  width: 25px; height: 25px;
  top: 75%; left: 25%;
  animation: starDrift1 4.2s ease-in-out 2s infinite;
  background: #ffec8b;
}

@keyframes starDrift1 {
  0%   { opacity: 0; transform: translate(0, 0) scale(0.3) rotate(0deg); }
  20%  { opacity: 0.8; }
  50%  { transform: translate(15px, -25px) scale(1) rotate(20deg); }
  80%  { opacity: 0.5; }
  100% { opacity: 0; transform: translate(-10px, 10px) scale(0.5) rotate(-10deg); }
}

@keyframes starDrift2 {
  0%   { opacity: 0; transform: translate(0, 0) scale(0.4) rotate(0deg); }
  20%  { opacity: 0.7; }
  50%  { transform: translate(-20px, 15px) scale(1.1) rotate(-15deg); }
  80%  { opacity: 0.4; }
  100% { opacity: 0; transform: translate(12px, -12px) scale(0.4) rotate(15deg); }
}

/* Firework sparkle bursts at various positions */
.firework {
  position: absolute;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: #f5c542;
  opacity: 0;
}

.firework-1 {
  top: 25%;
  left: 12%;
  animation: fireworkBurst 1.4s ease-out 0.2s forwards;
}

.firework-2 {
  top: 20%;
  right: 10%;
  animation: fireworkBurst 1.4s ease-out 0.45s forwards;
  background: #ffd700;
}

.firework-3 {
  top: 60%;
  left: 8%;
  animation: fireworkBurst 1.4s ease-out 0.7s forwards;
  background: #ffec8b;
}

.firework-4 {
  top: 55%;
  right: 12%;
  animation: fireworkBurst 1.4s ease-out 0.95s forwards;
  background: #fff8dc;
}

@keyframes fireworkBurst {
  0% {
    opacity: 1;
    transform: scale(1);
    box-shadow: none;
  }
  40% {
    opacity: 1;
    transform: scale(2);
    box-shadow:
      0 -35px 0 #ffd700,
      0 35px 0 #ffec8b,
      -35px 0 0 #f5c542,
      35px 0 0 #fff8dc,
      -25px -25px 0 #ffd700,
      25px -25px 0 #ffec8b,
      -25px 25px 0 #f5c542,
      25px 25px 0 #fff8dc,
      0 -18px 0 #ffffff,
      0 18px 0 #ffffff,
      -18px 0 0 #ffffff,
      18px 0 0 #ffffff;
  }
  100% {
    opacity: 0;
    transform: scale(0.5);
    box-shadow:
      0 -70px 0 transparent,
      0 70px 0 transparent,
      -70px 0 0 transparent,
      70px 0 0 transparent,
      -50px -50px 0 transparent,
      50px -50px 0 transparent,
      -50px 50px 0 transparent,
      50px 50px 0 transparent,
      0 -36px 0 transparent,
      0 36px 0 transparent,
      -36px 0 0 transparent,
      36px 0 0 transparent;
  }
}
</style>
