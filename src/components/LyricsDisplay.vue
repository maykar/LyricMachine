<template>
  <div class="lyrics-wrapper" ref="wrapperRef">
    <canvas ref="canvasRef" class="lyrics-canvas"></canvas>
  </div>
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
const canvasRef = ref(null)

// Layout state
const fontSize = ref(80)
const columnCount = ref(2)
const currentPage = ref(1)
const totalPages = ref(1)
const linesPerPage = ref(0)
const allLines = ref([])
const manualAdjust = ref(0)
const calculatedFontSize = ref(80)

// Display toggles
const mergeMode = ref(false)
const showSeparators = ref(false)
const showAltColors = ref(true)

// Stored geometry for synchronous recheckPages()
const storedColWidth = ref(0)
const storedAvailableHeight = ref(0)

const MAX_FONT = 80
const MIN_FONT = 20

// ─── Pretext constants ────────────────────────────────────────────────────────
// REF_PX: the reference font size for binary-search scaling trick.
// layout(prepared_at_16px, colWidth × 16/F, 16 × 1.45) gives the correct
// lineCount for font size F without re-running prepare() per candidate.
const REF_PX = 16
const FONT_SPEC = `${REF_PX}px Inter`
const LINE_HEIGHT_RATIO = 1.45
const ALT_COLOR = 'rgba(250,240,200,0.85)'
const SEP_COLOR = 'rgba(255,255,255,0.59)'

// ─── Theme color cache ───────────────────────────────────────────────────────
// Avoids calling getComputedStyle on every draw() — refresh on mount and resize.
let cachedTextColor = 'rgba(255,255,255,1)'
function refreshTheme() {
  if (wrapperRef.value) cachedTextColor = getComputedStyle(wrapperRef.value).color || 'rgba(255,255,255,1)'
}

// ─── Font cache ───────────────────────────────────────────────────────────────
const fontCache = new Map()

function getCacheKey(lyrics, merge) {
  const wrapper = wrapperRef.value
  if (!wrapper) return null
  let h = 5381
  for (let i = 0; i < lyrics.length; i++) h = ((h << 5) + h + lyrics.charCodeAt(i)) >>> 0
  return `${h}:${wrapper.clientWidth}x${wrapper.clientHeight}:${merge ? 1 : 0}`
}

// ─── Geometry helpers ─────────────────────────────────────────────────────────
function getRemPx() {
  return parseFloat(getComputedStyle(document.documentElement).fontSize)
}

// Pure function — no DOM, fully testable. Accepts raw dimensions + remPx.
function computeGeometryPure(W, H, remPx, cols) {
  const paddingH = 3 * remPx
  const paddingV = 3 * remPx
  const paddingTopExtra = 0.3125 * remPx
  const gap = cols === 3 ? 2 * remPx : 3 * remPx
  const colW = (W - 2 * paddingH - (cols - 1) * gap) / cols
  const availH = H - 2 * paddingV - paddingTopExtra
  return { W, H, remPx, paddingH, paddingV, paddingTopExtra, gap, colW, availH }
}

function computeGeometry(cols) {
  const wrapper = wrapperRef.value
  if (!wrapper) return null
  return computeGeometryPure(wrapper.clientWidth, wrapper.clientHeight, getRemPx(), cols)
}

// ─── Pretext measurement helpers ──────────────────────────────────────────────
// Each non-empty lyric line is measured individually — empty lines render as
// 0-height in canvas (they're skipped entirely), so they must also contribute
// 0 to the height estimate. Joining with \n and pre-wrap would make Pretext
// count empty lines as full line-height, overestimating height.
function findBestFont(lines, colWidth, availableHeight) {
  const preparedLines = lines.filter(l => l.trim()).map(l => prepare(l, FONT_SPEC))
  if (!preparedLines.length) return MAX_FONT

  let lo = MIN_FONT, hi = MAX_FONT, best = 0
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2)
    const scaledWidth = colWidth * REF_PX / mid
    const refLineHeight = REF_PX * LINE_HEIGHT_RATIO
    let totalLines = 0
    for (const p of preparedLines) {
      totalLines += layout(p, scaledWidth, refLineHeight).lineCount
    }
    if (totalLines * mid * LINE_HEIGHT_RATIO <= availableHeight) {
      best = mid
      lo = mid + 1
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
      const { lineCount } = layout(prepare(candidate, FONT_SPEC), colWidth * REF_PX / fontSizePx, REF_PX * LINE_HEIGHT_RATIO)
      if (lineCount === 1) { result.push(candidate); i += 2; continue }
    }
    result.push(line)
    i++
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

function firstColLines(lines, cols) {
  return lines.slice(0, Math.ceil(lines.length / cols))
}

// ─── calculate() — now fully synchronous, zero DOM reflows ────────────────────
// Dimensions come from arithmetic on wrapper.clientWidth/Height + remPx.
// No async, no nextTick, no column DOM elements to query.
function calculate() {
  const wrapper = wrapperRef.value
  if (!wrapper || !props.lyrics) return

  const rawLines = props.lyrics.split('\n')
  const collapsed = collapseRepeats(rawLines)

  const cacheKey = getCacheKey(props.lyrics, mergeMode.value)
  if (cacheKey && fontCache.has(cacheKey)) {
    const c = fontCache.get(cacheKey)
    allLines.value = c.allLines
    columnCount.value = c.columnCount
    linesPerPage.value = c.linesPerPage
    totalPages.value = c.totalPages
    calculatedFontSize.value = c.calculatedFontSize
    fontSize.value = c.calculatedFontSize + manualAdjust.value
    storedColWidth.value = c.colWidth
    storedAvailableHeight.value = c.availableHeight
    currentPage.value = 1
    return
  }

  function tryColumns(cols) {
    const g = computeGeometry(cols)
    if (!g) return false
    let lines = collapsed
    let best = findBestFont(firstColLines(collapsed, cols), g.colW, g.availH)
    if (best < MIN_FONT) return false

    if (mergeMode.value) {
      const merged = mergeShortLines(collapsed, best, g.colW)
      if (merged.length < collapsed.length) {
        const bestM = findBestFont(firstColLines(merged, cols), g.colW, g.availH)
        if (bestM >= MIN_FONT) { lines = mergeShortLines(collapsed, bestM, g.colW); best = bestM }
      }
    }

    allLines.value = lines
    columnCount.value = cols
    linesPerPage.value = lines.length
    totalPages.value = 1
    currentPage.value = 1
    storedColWidth.value = g.colW
    storedAvailableHeight.value = g.availH
    calculatedFontSize.value = best
    fontSize.value = best + manualAdjust.value
    if (cacheKey) fontCache.set(cacheKey, {
      allLines: lines, columnCount: cols, linesPerPage: lines.length,
      totalPages: 1, calculatedFontSize: best, colWidth: g.colW, availableHeight: g.availH,
    })
    return true
  }

  if (tryColumns(2)) return
  if (tryColumns(3)) return

  // Multi-page with 3 columns
  const g3 = computeGeometry(3)
  if (!g3) return
  columnCount.value = 3
  allLines.value = collapsed
  storedColWidth.value = g3.colW
  storedAvailableHeight.value = g3.availH

  for (let pages = 2; pages <= 10; pages++) {
    const perCol = Math.ceil(collapsed.length / (3 * pages))
    const best = findBestFont(collapsed.slice(0, perCol), g3.colW, g3.availH)
    if (best >= MIN_FONT) {
      linesPerPage.value = perCol * 3
      totalPages.value = pages
      currentPage.value = 1
      calculatedFontSize.value = best
      fontSize.value = best + manualAdjust.value
      if (cacheKey) fontCache.set(cacheKey, {
        allLines: collapsed, columnCount: 3, linesPerPage: perCol * 3,
        totalPages: pages, calculatedFontSize: best, colWidth: g3.colW, availableHeight: g3.availH,
      })
      return
    }
  }

  fontSize.value = MIN_FONT
  calculatedFontSize.value = MIN_FONT
  linesPerPage.value = Math.ceil(collapsed.length / 3) * 3
}

// ─── draw() — canvas rendering ────────────────────────────────────────────────
function draw() {
  const canvas = canvasRef.value
  const wrapper = wrapperRef.value
  if (!canvas || !wrapper) return

  const dpr = window.devicePixelRatio || 1
  const W = wrapper.clientWidth
  const H = wrapper.clientHeight

  // Resize canvas backing store to match DPR for crisp text
  canvas.width = W * dpr
  canvas.height = H * dpr

  const ctx = canvas.getContext('2d')
  // Reset transform absolutely — avoid scale accumulation on repeated calls
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, W, H)

  if (!allLines.value.length || !props.lyrics) return

  const remPx = getRemPx()
  const paddingH = 3 * remPx
  const paddingV = 3 * remPx
  const paddingTopExtra = 0.3125 * remPx

  const cols = columnCount.value
  const gap = cols === 3 ? 2 * remPx : 3 * remPx
  const colW = (W - 2 * paddingH - (cols - 1) * gap) / cols
  const fs = fontSize.value
  const lineHeight = fs * LINE_HEIGHT_RATIO

  const textColor = cachedTextColor
  const altColor = ALT_COLOR
  const sepColor = SEP_COLOR

  ctx.font = `${fs}px Inter`
  ctx.textBaseline = 'top'

  const perPage = linesPerPage.value
  const pageStart = (currentPage.value - 1) * perPage
  const pageLines = allLines.value.slice(pageStart, pageStart + perPage)
  const perCol = Math.ceil(perPage / cols)

  for (let c = 0; c < cols; c++) {
    const rawColLines = pageLines.slice(c * perCol, (c + 1) * perCol)

    // Trim leading/trailing empty lines — matches CSS :first-child/:last-child display:none
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
        // Interior empty line — draw separator if enabled, no height contribution
        if (showSeparators.value) {
          ctx.fillStyle = sepColor
          // Center the rule in the gap between adjacent lines (line-height minus cap-height)
          const ruleY = y - (lineHeight - fs) / 2 - 0.5
          ctx.fillRect(colStartX - 2 * remPx, ruleY, 3.75 * remPx, 1)
        }
        continue
      }

      ctx.fillStyle = showAltColors.value && nonEmptyCount % 2 === 1 ? altColor : textColor
      nonEmptyCount++

      // Fast path: single non-wrapping line
      const lineW = ctx.measureText(line).width
      if (lineW <= colW) {
        ctx.fillText(line, colStartX, y)
        y += lineHeight
      } else {
        // Line wraps — use Pretext to get exact visual line breaks
        const p = prepareWithSegments(line, `${fs}px Inter`)
        const { lines: vlines } = layoutWithLines(p, colW, lineHeight)
        for (const vline of vlines) {
          ctx.fillText(vline.text, colStartX, y)
          y += lineHeight
        }
      }
    }
  }
}

// ─── recheckPages — fully synchronous ────────────────────────────────────────
function recheckPages() {
  const colWidth = storedColWidth.value
  const availableHeight = storedAvailableHeight.value
  if (!colWidth || !availableHeight || !allLines.value.length) return

  const cols = columnCount.value
  const currentFont = fontSize.value

  function colFits(pages) {
    const perCol = Math.ceil(allLines.value.length / (cols * pages))
    const pageLines = allLines.value.slice(0, perCol)
    if (!pageLines.length) return true
    const scaledWidth = colWidth * REF_PX / currentFont
    const refLineHeight = REF_PX * LINE_HEIGHT_RATIO
    let totalLines = 0
    for (const line of pageLines) {
      if (!line.trim()) continue
      totalLines += layout(prepare(line, FONT_SPEC), scaledWidth, refLineHeight).lineCount
    }
    return totalLines * currentFont * LINE_HEIGHT_RATIO <= availableHeight
  }

  if (!colFits(totalPages.value)) {
    for (let p = totalPages.value + 1; p <= 10; p++) {
      if (colFits(p)) {
        const perCol = Math.ceil(allLines.value.length / (cols * p))
        linesPerPage.value = perCol * cols
        totalPages.value = p
        currentPage.value = Math.min(currentPage.value, p)
        break
      }
    }
  } else {
    while (totalPages.value > 1) {
      const tryPages = totalPages.value - 1
      if (colFits(tryPages)) {
        const perCol = Math.ceil(allLines.value.length / (cols * tryPages))
        linesPerPage.value = perCol * cols
        totalPages.value = tryPages
        currentPage.value = Math.min(currentPage.value, tryPages)
      } else {
        break
      }
    }
  }
}

// ─── Keyboard handler ─────────────────────────────────────────────────────────
function onKeydown(e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
  if (props.overlayOpen) return

  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
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
    fontSize.value = calculatedFontSize.value + manualAdjust.value
    emit('adjust-changed', manualAdjust.value)
    recheckPages(); draw()
  } else if (e.key === '-' || e.key === '_') {
    e.preventDefault()
    if (fontSize.value > 8) {
      manualAdjust.value--
      fontSize.value = calculatedFontSize.value + manualAdjust.value
      emit('adjust-changed', manualAdjust.value)
      recheckPages(); draw()
    }
  } else if (e.key === 'm' || e.key === 'M') {
    e.preventDefault()
    mergeMode.value = !mergeMode.value
    emit('merge-changed', mergeMode.value)
    calculate(); draw()
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
  calculate()
  draw()
})

watch(() => props.initialMerge, (val) => {
  mergeMode.value = val || false
  if (props.lyrics) { calculate(); draw() }
})

watch(() => props.initialSeparators, (val) => {
  showSeparators.value = val || false
  draw()
})

watch(() => props.initialAltColors, (val) => {
  showAltColors.value = val !== false
  draw()
})

// ─── Resize ───────────────────────────────────────────────────────────────────
// Only recalculate on genuine window resize — not drawer animation.
// object-fit: contain handles drawer open/close visually with no JS needed.
let settleTimer = null

useEventListener(window, 'keydown', onKeydown)
useEventListener(window, 'resize', () => {
  clearTimeout(settleTimer)
  settleTimer = setTimeout(() => {
    refreshTheme()
    fontCache.clear()
    if (props.lyrics) { calculate(); draw() }
  }, 300)
})

onMounted(() => {
  refreshTheme()
  if (props.lyrics) { calculate(); draw() }
})

onUnmounted(() => {
  clearTimeout(settleTimer)
})

// ─── Public API ───────────────────────────────────────────────────────────────
function adjustFont(delta) {
  if (delta > 0 || fontSize.value > 8) {
    manualAdjust.value += delta
    fontSize.value = calculatedFontSize.value + manualAdjust.value
    emit('adjust-changed', manualAdjust.value)
    recheckPages()
    draw()
  }
}

function resetFont() {
  manualAdjust.value = 0
  fontSize.value = calculatedFontSize.value
  emit('adjust-changed', 0)
  recheckPages()
  draw()
}

defineExpose({
  totalPages,
  currentPage,
  adjustFont,
  resetFont,
  triggerResize: () => {
    clearTimeout(settleTimer)
    fontCache.clear()
    calculate()
    draw()
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

.lyrics-canvas {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: top center;
}
</style>
