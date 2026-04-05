<template>
  <div class="lyrics-wrapper" ref="wrapperRef"></div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { useEventListener } from '@vueuse/core'
import { prepare, layout, prepareWithSegments, layoutWithLines } from '@chenglou/pretext'

const props = defineProps({
  lyrics: { type: String, default: '' },
  initialAdjust: { type: Number, default: 0 },
  initialMerge: { type: Boolean, default: false },
  initialSeparators: { type: Boolean, default: false },
  initialAltColors: { type: Boolean, default: true },
  overlayOpen: { type: Boolean, default: false },
})

const emit = defineEmits(['adjust-changed', 'merge-changed', 'separators-changed', 'alt-colors-changed'])

const wrapperRef = ref(null)

// Layout state
const fontSize = ref(80)
const columnCount = ref(2)
const currentPage = ref(1)
const totalPages = ref(1)
const linesPerPage = ref(0)
const allLines = ref([])
const manualAdjust = ref(0)
const calculatedFontSize = ref(80)
const storedColWidth = ref(0)
const storedAvailableHeight = ref(0)

// Display toggles
const mergeMode = ref(false)
const showSeparators = ref(false)
const showAltColors = ref(true)

// Constants
const MAX_FONT = 80
const MIN_FONT = 20
const REF_PX = 16
const FONT_SPEC = `${REF_PX}px Inter`
const LINE_HEIGHT_RATIO = 1.45
const ALT_COLOR = 'rgba(250,240,200,0.85)'
const SEP_COLOR = 'rgba(255,255,255,0.59)'

// Caches
const fontCache = new Map()       // layout results keyed by (lyricsHash × dims × merge)
const prepareCache = new Map()    // prepare() results keyed by line text (font-size-independent)
const segmentsCache = new Map()   // prepareWithSegments keyed by line text
const SEGMENTS_CACHE_MAX = 2000   // LRU cap — clear all when exceeded

// Theme color
let cachedTextColor = 'rgba(255,255,255,1)'
function refreshTheme() {
  if (wrapperRef.value) cachedTextColor = getComputedStyle(wrapperRef.value).color || 'rgba(255,255,255,1)'
}

// Div pool
let linePool = []
let rafId = null
let lastW = 0
let lastH = 0
let displayFontSize = -1 // lerped toward fontSize.value each frame; -1 = snap next frame
let resizePending = false // set by ResizeObserver, consumed by next rAF tick
let resizeObserver = null

// ─── Geometry ─────────────────────────────────────────────────────────────────
function getRemPx() {
  return parseFloat(getComputedStyle(document.documentElement).fontSize)
}

function computeGeometryPure(W, H, remPx, cols) {
  const paddingH = 3 * remPx
  const paddingV = 3 * remPx
  const paddingTopExtra = 0.3125 * remPx
  const paddingBottomExtra = 0.25 * remPx  // sub-pixel rounding buffer
  const gap = cols === 3 ? 2 * remPx : 3 * remPx
  const colW = (W - 2 * paddingH - (cols - 1) * gap) / cols
  const availH = H - 2 * paddingV - paddingTopExtra - paddingBottomExtra
  return { W, H, remPx, paddingH, paddingV, paddingTopExtra, gap, colW, availH }
}

function computeGeometry(cols) {
  const wrapper = wrapperRef.value
  if (!wrapper) return null
  return computeGeometryPure(wrapper.clientWidth, wrapper.clientHeight, getRemPx(), cols)
}

// ─── Cache key ────────────────────────────────────────────────────────────────
function getCacheKey(lyrics, merge) {
  const wrapper = wrapperRef.value
  if (!wrapper) return null
  let h = 5381
  for (let i = 0; i < lyrics.length; i++) h = ((h << 5) + h + lyrics.charCodeAt(i)) >>> 0
  return `${h}:${wrapper.clientWidth}x${wrapper.clientHeight}:${merge ? 1 : 0}`
}

// ─── Pretext helpers ──────────────────────────────────────────────────────────

// Split lines into columns, trim leading/trailing blanks per column (matching draw()),
// and return the tallest column's visual line count at a given font size.
function tallestColVisualLines(allLines, cols, colWidth, fontSizePx) {
  const perCol = Math.ceil(allLines.length / cols)
  const scaledW = colWidth * REF_PX / fontSizePx
  const refLH = REF_PX * LINE_HEIGHT_RATIO
  let maxLines = 0
  for (let c = 0; c < cols; c++) {
    const raw = allLines.slice(c * perCol, (c + 1) * perCol)
    let first = raw.findIndex(l => l.trim())
    if (first === -1) continue
    let last = raw.length - 1
    while (last > first && !raw[last].trim()) last--
    let n = 0
    for (let i = first; i <= last; i++) {
      if (!raw[i].trim()) continue
      let p = prepareCache.get(raw[i])
      if (!p) { p = prepare(raw[i], FONT_SPEC); prepareCache.set(raw[i], p) }
      n += layout(p, scaledW, refLH).lineCount
    }
    if (n > maxLines) maxLines = n
  }
  return maxLines
}

function findBestFont(allLines, cols, colWidth, availableHeight) {
  if (!allLines.some(l => l.trim())) return MAX_FONT
  let lo = MIN_FONT, hi = MAX_FONT, best = 0
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2)
    const maxLines = tallestColVisualLines(allLines, cols, colWidth, mid)
    if (maxLines * mid * LINE_HEIGHT_RATIO <= availableHeight) {
      best = mid; lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return best
}

function mergeShortLines(lines, fontSizePx, colWidth) {
  const result = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) { result.push(line); i++; continue }
    const hasRepeat = /\(x\d+\)$/.test(line)
    const nextHasRepeat = i + 1 < lines.length && /\(x\d+\)$/.test(lines[i + 1])
    if (!hasRepeat && !nextHasRepeat && i + 1 < lines.length && lines[i + 1].trim()) {
      const candidate = line + ' — ' + lines[i + 1]
      let p = prepareCache.get(candidate)
      if (!p) { p = prepare(candidate, FONT_SPEC); prepareCache.set(candidate, p) }
      const { lineCount } = layout(p, colWidth * REF_PX / fontSizePx, REF_PX * LINE_HEIGHT_RATIO)
      if (lineCount === 1) { result.push(candidate); i += 2; continue }
    }
    result.push(line); i++
  }
  return result
}

function collapseRepeats(lines) {
  const result = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) { result.push(line); i++; continue }
    let count = 1
    while (i + count < lines.length && lines[i + count] === line) count++
    result.push(count > 1 ? `${line} (x${count})` : line)
    i += count
  }
  return result
}

// ─── Auto layout: binary search for optimal font, prefer 2 cols ───────────────
function autoLayout(collapsed) {
  // Prefer 2 cols (wider = more readable). Only use 3 cols if 2 fails.
  for (const cols of [2, 3]) {
    const g = computeGeometry(cols)
    if (!g) continue
    let lines = collapsed
    let best = findBestFont(collapsed, cols, g.colW, g.availH)
    if (best < MIN_FONT) continue

    if (mergeMode.value) {
      const merged = mergeShortLines(collapsed, best, g.colW)
      if (merged.length < collapsed.length) {
        const bestM = findBestFont(merged, cols, g.colW, g.availH)
        if (bestM >= MIN_FONT) { lines = mergeShortLines(collapsed, bestM, g.colW); best = bestM }
      }
    }
    return { allLines: lines, columnCount: cols, linesPerPage: lines.length,
      totalPages: 1, calculatedFontSize: best, colWidth: g.colW, availableHeight: g.availH }
  }

  // Multi-page with 3 cols
  const g3 = computeGeometry(3)
  if (!g3) return null
  for (let pages = 2; pages <= 10; pages++) {
    const perCol = Math.ceil(collapsed.length / (3 * pages))
    const pageLines = collapsed.slice(0, perCol * 3)
    const best = findBestFont(pageLines, 3, g3.colW, g3.availH)
    if (best >= MIN_FONT) {
      return { allLines: collapsed, columnCount: 3, linesPerPage: perCol * 3,
        totalPages: pages, calculatedFontSize: best, colWidth: g3.colW, availableHeight: g3.availH }
    }
  }
  const g3f = computeGeometry(3)
  return { allLines: collapsed, columnCount: 3, linesPerPage: Math.ceil(collapsed.length / 3) * 3,
    totalPages: 2, calculatedFontSize: MIN_FONT, colWidth: g3f?.colW ?? 0, availableHeight: g3f?.availH ?? 0 }
}

// ─── Manual layout: find simplest cols/pages that fit a fixed font ────────────
function checkFitsAtFont(allLines, cols, colWidth, availH, font) {
  const maxLines = tallestColVisualLines(allLines, cols, colWidth, font)
  return maxLines * font * LINE_HEIGHT_RATIO <= availH
}

function applyAutoResult(r) {
  allLines.value = r.allLines
  columnCount.value = r.columnCount
  linesPerPage.value = r.linesPerPage
  totalPages.value = r.totalPages
  currentPage.value = Math.min(currentPage.value, r.totalPages)
  calculatedFontSize.value = r.calculatedFontSize
  fontSize.value = r.calculatedFontSize + manualAdjust.value
  storedColWidth.value = r.colWidth
  storedAvailableHeight.value = r.availableHeight
}

function applyLayoutAtFont(collapsed, mergedLines, targetFont) {
  // Try 2 cols → 3 cols → multi-page; pick simplest that fits targetFont
  for (const cols of [2, 3]) {
    const g = computeGeometry(cols)
    if (!g) continue
    if (checkFitsAtFont(mergedLines, cols, g.colW, g.availH, targetFont)) {
      allLines.value = mergedLines
      columnCount.value = cols
      linesPerPage.value = mergedLines.length
      totalPages.value = 1
      currentPage.value = Math.min(currentPage.value, 1)
      storedColWidth.value = g.colW
      storedAvailableHeight.value = g.availH
      return
    }
  }
  const g3 = computeGeometry(3)
  if (!g3) return
  columnCount.value = 3
  allLines.value = collapsed
  storedColWidth.value = g3.colW
  storedAvailableHeight.value = g3.availH
  for (let pages = 2; pages <= 10; pages++) {
    const perCol = Math.ceil(collapsed.length / (3 * pages))
    if (checkFitsAtFont(collapsed.slice(0, perCol * 3), 3, g3.colW, g3.availH, targetFont)) {
      linesPerPage.value = perCol * 3
      totalPages.value = pages
      currentPage.value = Math.min(currentPage.value, pages)
      return
    }
  }
  linesPerPage.value = Math.ceil(collapsed.length / 3) * 3
  totalPages.value = 2
  currentPage.value = Math.min(currentPage.value, 2)
}

// ─── calculate() ─────────────────────────────────────────────────────────────
function calculate() {
  const wrapper = wrapperRef.value
  if (!wrapper || !props.lyrics) return

  const rawLines = props.lyrics.split('\n')
  const collapsed = collapseRepeats(rawLines)

  // Cache key covers auto layout only (no manualAdjust) — auto result is dimension-dependent
  const cacheKey = getCacheKey(props.lyrics, mergeMode.value)
  let auto = cacheKey ? fontCache.get(cacheKey) : null

  if (!auto) {
    auto = autoLayout(collapsed)
    if (!auto) return
    if (cacheKey) fontCache.set(cacheKey, auto)
  }

  calculatedFontSize.value = auto.calculatedFontSize

  if (manualAdjust.value === 0) {
    // Use auto result directly
    applyAutoResult(auto)
  } else {
    // Re-evaluate cols/pages at the user-requested font size
    const targetFont = Math.max(1, auto.calculatedFontSize + manualAdjust.value)
    fontSize.value = targetFont
    applyLayoutAtFont(collapsed, auto.allLines, targetFont)
  }
}

// ─── Div pool ─────────────────────────────────────────────────────────────────
function ensurePool(n) {
  const wrapper = wrapperRef.value
  if (!wrapper) return
  while (linePool.length < n) {
    const el = document.createElement('div')
    el.style.cssText = 'position:absolute;white-space:pre;pointer-events:none;font-family:Inter,sans-serif;display:none'
    wrapper.appendChild(el)
    linePool.push(el)
  }
}

function hideAll() {
  for (const el of linePool) el.style.display = 'none'
}

// ─── draw() ──────────────────────────────────────────────────────────────────
function draw() {
  const wrapper = wrapperRef.value
  if (!wrapper || !allLines.value.length || !props.lyrics) { hideAll(); return }

  const remPx = getRemPx()
  const cols = columnCount.value
  const gap = cols === 3 ? 2 * remPx : 3 * remPx
  const paddingH = 3 * remPx
  const paddingV = 3 * remPx
  const paddingTopExtra = 0.3125 * remPx
  const colW = (wrapper.clientWidth - 2 * paddingH - (cols - 1) * gap) / cols
  const fs = displayFontSize > 0 ? displayFontSize : fontSize.value
  const lineHeight = fs * LINE_HEIGHT_RATIO
  const _fsKey = String(Math.round(fs)) // kept for compatibility, unused in new cache scheme

  const perPage = linesPerPage.value
  const pageStart = (currentPage.value - 1) * perPage
  const pageLines = allLines.value.slice(pageStart, pageStart + perPage)
  const perCol = Math.ceil(perPage / cols)

  let divIdx = 0

  for (let c = 0; c < cols; c++) {
    const rawColLines = pageLines.slice(c * perCol, (c + 1) * perCol)
    let first = rawColLines.findIndex(l => l.trim())
    if (first === -1) continue
    let last = rawColLines.length - 1
    while (last > first && !rawColLines[last].trim()) last--
    const colLines = rawColLines.slice(first, last + 1)

    const colStartX = paddingH + c * (colW + gap)
    let y = paddingV + paddingTopExtra
    let nonEmptyCount = 0

    for (const line of colLines) {
      if (!line.trim()) {
        if (showSeparators.value) {
          ensurePool(divIdx + 1)
          const el = linePool[divIdx++]
          const ruleY = y - (lineHeight - fs) / 2 - 0.5
          el.style.cssText = `position:absolute;pointer-events:none;display:block;left:${colStartX - 2 * remPx}px;top:${ruleY}px;width:${3.75 * remPx}px;height:1px;background:${SEP_COLOR}`
          el.textContent = ''
        }
        continue
      }

      const isAlt = showAltColors.value && nonEmptyCount % 2 === 1
      const color = isAlt ? ALT_COLOR : cachedTextColor
      nonEmptyCount++

      // Get or cache prepareWithSegments — keyed by line text only.
      // Uses REF_PX font spec + scaled colW so cache is font-size-independent.
      if (!segmentsCache.has(line)) {
        if (segmentsCache.size >= SEGMENTS_CACHE_MAX) segmentsCache.clear()
        segmentsCache.set(line, prepareWithSegments(line, FONT_SPEC))
      }
      const scaledColW = colW * REF_PX / fs
      const { lines: vlines } = layoutWithLines(segmentsCache.get(line), scaledColW, REF_PX * LINE_HEIGHT_RATIO)

      for (const vline of vlines) {
        ensurePool(divIdx + 1)
        const el = linePool[divIdx++]
        el.style.cssText = `position:absolute;white-space:pre;pointer-events:none;font-family:Inter,sans-serif;display:block;left:${colStartX}px;top:${y}px;font-size:${fs}px;line-height:${LINE_HEIGHT_RATIO};color:${color}`
        el.textContent = vline.text
        y += lineHeight
      }
    }
  }

  // Hide unused pool entries
  for (let i = divIdx; i < linePool.length; i++) {
    linePool[i].style.display = 'none'
  }
}

// ─── rAF loop — runs only while animating or after a resize ──────────────────
function rafLoop() {
  rafId = null  // cleared first so startRaf() can re-arm
  const wrapper = wrapperRef.value
  if (!wrapper || !props.lyrics) return

  if (resizePending) {
    resizePending = false
    calculate()
  }

  // Snap on first frame after song load; otherwise lerp toward target
  const target = fontSize.value
  if (displayFontSize < 0) displayFontSize = target

  const diff = target - displayFontSize
  const settling = Math.abs(diff) > 0.05

  if (settling) {
    displayFontSize += diff * 0.2
    draw()
    // Still animating — keep loop alive
    rafId = requestAnimationFrame(rafLoop)
  } else {
    if (displayFontSize !== target) {
      displayFontSize = target
      draw()
    }
    // Lerp settled — loop stops; ResizeObserver or next state change will restart it
  }
}

/** Start the rAF loop if it's not already running */
function startRaf() {
  if (!rafId) rafId = requestAnimationFrame(rafLoop)
}

// recheckPages() removed — font adjustments now force a full recalculate so
// column count can change freely. See adjustFont / resetFont below.

// ─── Keyboard handler ─────────────────────────────────────────────────────────
function resetToDefaults() {
  manualAdjust.value = 0
  mergeMode.value = props.initialMerge || false
  showSeparators.value = props.initialSeparators || false
  showAltColors.value = props.initialAltColors !== false
  currentPage.value = 1
  emit('adjust-changed', 0)
  displayFontSize = -1 // snap to new auto font
  fontCache.clear()
  lastW = 0; lastH = 0
  startRaf()
}

function onKeydown(e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
  if (props.overlayOpen) return

  if (e.key === '0') {
    e.preventDefault()
    resetToDefaults()
  } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
    if (totalPages.value <= 1) return
    e.preventDefault()
    if (currentPage.value < totalPages.value) { currentPage.value++; draw() }
  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
    if (totalPages.value <= 1) return
    e.preventDefault()
    if (currentPage.value > 1) { currentPage.value--; draw() }
  } else if (e.key === '=' || e.key === '+') {
    e.preventDefault()
    manualAdjust.value++
    emit('adjust-changed', manualAdjust.value)
    fontCache.clear()
    displayFontSize = fontSize.value + 1
    lastW = 0; lastH = 0
    startRaf()
  } else if (e.key === '-' || e.key === '_') {
    e.preventDefault()
    if (fontSize.value > 8) {
      manualAdjust.value--
      emit('adjust-changed', manualAdjust.value)
      fontCache.clear()
      displayFontSize = fontSize.value - 1
      lastW = 0; lastH = 0
      startRaf()
    }
  } else if (e.key === 'm' || e.key === 'M') {
    e.preventDefault()
    mergeMode.value = !mergeMode.value
    emit('merge-changed', mergeMode.value)
    fontCache.clear()
    lastW = 0; lastH = 0
    startRaf()
  } else if (e.key === 'l' || e.key === 'L') {
    e.preventDefault()
    showSeparators.value = !showSeparators.value
    emit('separators-changed', showSeparators.value)
    draw()
  } else if (e.key === 'h' || e.key === 'H') {
    e.preventDefault()
    showAltColors.value = !showAltColors.value
    emit('alt-colors-changed', showAltColors.value)
    draw()
  }
}

// ─── Watchers ─────────────────────────────────────────────────────────────────
watch(() => props.lyrics, () => {
  manualAdjust.value = props.initialAdjust || 0
  mergeMode.value = props.initialMerge || false
  showSeparators.value = props.initialSeparators || false
  showAltColors.value = props.initialAltColors !== false
  displayFontSize = -1
  lastW = 0; lastH = 0
  prepareCache.clear()
  segmentsCache.clear()
  startRaf()
})

watch(() => props.initialMerge, (val) => {
  mergeMode.value = val || false
  if (props.lyrics) { lastW = 0; lastH = 0; startRaf() }
})

watch(() => props.initialSeparators, (val) => {
  showSeparators.value = val || false
  if (props.lyrics) draw()
})

watch(() => props.initialAltColors, (val) => {
  showAltColors.value = val !== false
  if (props.lyrics) draw()
})

// ─── Lifecycle ────────────────────────────────────────────────────────────────
useEventListener(window, 'keydown', onKeydown)

onMounted(() => {
  refreshTheme()
  // ResizeObserver fires only on actual size changes (replaces per-frame clientWidth polling)
  resizeObserver = new ResizeObserver(() => {
    const wrapper = wrapperRef.value
    if (!wrapper || !props.lyrics) return
    const w = wrapper.clientWidth
    const h = wrapper.clientHeight
    if (w === lastW && h === lastH) return
    lastW = w
    lastH = h
    resizePending = true
    startRaf()
  })
  // Wait for Inter font before first layout so measurements are accurate
  document.fonts.ready.then(() => {
    if (wrapperRef.value) resizeObserver.observe(wrapperRef.value)
    startRaf()
  })
})

onUnmounted(() => {
  if (rafId) cancelAnimationFrame(rafId)
  rafId = null
  resizeObserver?.disconnect()
  resizeObserver = null
  linePool.forEach(el => el.remove())
  linePool = []
})

// ─── Public API ───────────────────────────────────────────────────────────────
function adjustFont(delta) {
  if (delta > 0 || fontSize.value > 8) {
    manualAdjust.value += delta
    emit('adjust-changed', manualAdjust.value)
    fontCache.clear()
    displayFontSize = fontSize.value + delta
    lastW = 0; lastH = 0
    startRaf()
  }
}

function resetFont() {
  manualAdjust.value = 0
  emit('adjust-changed', 0)
  fontCache.clear()
  displayFontSize = -1
  lastW = 0; lastH = 0
  startRaf()
}

defineExpose({
  totalPages,
  currentPage,
  adjustFont,
  resetFont,
  resetToDefaults,
  triggerResize: () => {
    fontCache.clear()
    segmentsCache.clear()
    lastW = 0; lastH = 0
    startRaf()
  },
})
</script>

<style scoped>
.lyrics-wrapper {
  width: 100%;
  height: 100%;
  overflow: hidden;
  position: relative;
}
</style>
