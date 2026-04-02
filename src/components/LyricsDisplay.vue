<template>
  <div class="lyrics-wrapper" ref="wrapperRef">
    <div
      class="lyrics-columns"
      :style="{ fontSize: fontSize + 'px' }"
      :class="'cols-' + columnCount"
    >
      <div
        v-for="(col, ci) in visibleColumns"
        :key="ci"
        class="lyrics-col"
      >
        <div
          v-for="(line, li) in col.lines"
          :key="li"
          class="lyric-line"
          :class="{ alt: showAltColors && col.altSet.has(li), empty: showSeparators && !line.trim() }"
        >{{ line }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { useEventListener } from '@vueuse/core'
import { prepare, layout } from '@chenglou/pretext'

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

const fontSize = ref(80)
const columnCount = ref(2)
const currentPage = ref(1)
const totalPages = ref(1)
const linesPerPage = ref(0)
const allLines = ref([])
const manualAdjust = ref(0)
const calculatedFontSize = ref(80)
const mergeMode = ref(false)
const showSeparators = ref(false)
const showAltColors = ref(true)

// Stored from last calculate() call — used by recheckPages() to avoid re-reading DOM
const storedColWidth = ref(0)
const storedAvailableHeight = ref(0)

const MAX_FONT = 80
const MIN_FONT = 20

// --- Pretext constants ---
// Reference pixel size for canvas measurement. Actual font size is handled via
// the linear-scaling trick: layout at (colWidth × REF_PX / targetSize) gives the
// correct lineCount for targetSize, without re-running prepare() per candidate.
const REF_PX = 16
const FONT_SPEC = `${REF_PX}px Inter`  // must match CSS font-family
const LINE_HEIGHT_RATIO = 1.45         // must match CSS line-height on .lyrics-columns

// --- Font size cache: skip binary search on revisit ---
const fontCache = new Map()

function getCacheKey(lyrics, merge) {
  const wrapper = wrapperRef.value
  if (!wrapper) return null
  // djb2 hash of lyrics content — avoids false cache hits for same-length different content
  let h = 5381
  for (let i = 0; i < lyrics.length; i++) h = ((h << 5) + h + lyrics.charCodeAt(i)) >>> 0
  return `${h}:${wrapper.clientWidth}x${wrapper.clientHeight}:${merge ? 1 : 0}`
}

// Build columns + precomputed alt-line Sets for the current page
const visibleColumns = computed(() => {
  const cols = columnCount.value
  const perPage = linesPerPage.value
  if (!perPage) return []
  const start = (currentPage.value - 1) * perPage
  const pageLines = allLines.value.slice(start, start + perPage)
  const perCol = Math.ceil(perPage / cols)

  const result = []
  for (let c = 0; c < cols; c++) {
    const colLines = pageLines.slice(c * perCol, (c + 1) * perCol)
    // Precompute which line indices are "alt" (every other non-empty line)
    const altSet = new Set()
    let count = 0
    for (let i = 0; i < colLines.length; i++) {
      if (colLines[i]?.trim()) {
        if (count % 2 === 1) altSet.add(i)
        count++
      }
    }
    result.push({ lines: colLines, altSet })
  }
  return result
})

// Collapse consecutive duplicate lines: "line\nline\nline" → "line (x3)"
function collapseRepeats(lines) {
  const result = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    // Don't collapse empty/blank lines
    if (!line.trim()) {
      result.push(line)
      i++
      continue
    }
    let count = 1
    while (i + count < lines.length && lines[i + count] === line) {
      count++
    }
    result.push(count > 1 ? `${line} (x${count})` : line)
    i += count
  }
  return result
}

// --- Pretext-powered binary search ---
// Key insight: empty lyric lines render as 0-height <div>s in the DOM (empty block
// elements have no height). Joining all lines with '\n' and using pre-wrap would
// cause Pretext to count empty lines as full line-height — overestimating total
// height for songs with blank separators between verses/choruses.
//
// Fix: prepare each NON-EMPTY line individually. Each is measured for wrapping
// at the candidate font size (via the scaling trick), and empty lines contribute
// 0 to the height estimate — exactly matching DOM rendering.
function findBestFont(lines, colWidth, availableHeight) {
  // Pre-prepare every non-empty line once (O(N) prepare calls, all fast for short strings)
  const preparedLines = lines
    .filter(l => l.trim())
    .map(l => prepare(l, FONT_SPEC))

  if (!preparedLines.length) return MAX_FONT

  let lo = MIN_FONT, hi = MAX_FONT, best = 0
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2)
    // Scale colWidth to REF_PX domain for the linear scaling trick.
    const scaledWidth = colWidth * REF_PX / mid
    const refLineHeight = REF_PX * LINE_HEIGHT_RATIO
    // Sum visual lines across all non-empty lyric lines, accounting for any
    // individual line wrapping within the column width.
    let totalVisualLines = 0
    for (const p of preparedLines) {
      totalVisualLines += layout(p, scaledWidth, refLineHeight).lineCount
    }
    // Convert back to actual pixel height at the candidate font size.
    if (totalVisualLines * mid * LINE_HEIGHT_RATIO <= availableHeight) {
      best = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return best  // 0 if nothing fits
}

// --- Pretext-powered merge line check ---
// No hidden DOM span needed — use the same scaling trick for a single-line check.
function mergeShortLines(lines, fontSizePx, colWidth) {
  const result = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    // Skip empty lines (section separators) — never merge across them
    if (!line.trim()) {
      result.push(line)
      i++
      continue
    }

    // Try to merge with next non-empty line (pairs only, never 3+)
    // Never merge lines with repeat markers like (x2)
    const hasRepeat = /\(x\d+\)$/.test(line)
    const nextHasRepeat = i + 1 < lines.length && /\(x\d+\)$/.test(lines[i + 1])
    if (!hasRepeat && !nextHasRepeat && i + 1 < lines.length && lines[i + 1].trim()) {
      const candidate = line + ' — ' + lines[i + 1]
      // prepare() is fast for short single-line strings (~0.04ms each)
      const p = prepare(candidate, FONT_SPEC)
      const scaledWidth = colWidth * REF_PX / fontSizePx
      const { lineCount } = layout(p, scaledWidth, REF_PX * LINE_HEIGHT_RATIO)
      if (lineCount === 1) {
        result.push(candidate)
        i += 2
        continue
      }
    }
    result.push(line)
    i++
  }
  return result
}

// Returns the first column's lines for a given total line array and column count.
// The first column always has the maximum lines (ceil distribution),
// so checking it is sufficient to verify fit for the entire layout.
function firstColLines(lines, cols) {
  return lines.slice(0, Math.ceil(lines.length / cols))
}

async function calculate() {
  const wrapper = wrapperRef.value
  if (!wrapper || !props.lyrics) return

  const rawLines = props.lyrics.split('\n')
  const collapsed = collapseRepeats(rawLines)

  // Check font cache — skip binary search on revisit
  const cacheKey = getCacheKey(props.lyrics, mergeMode.value)
  if (cacheKey && fontCache.has(cacheKey)) {
    const cached = fontCache.get(cacheKey)
    allLines.value = cached.allLines
    columnCount.value = cached.columnCount
    linesPerPage.value = cached.linesPerPage
    totalPages.value = cached.totalPages
    calculatedFontSize.value = cached.calculatedFontSize
    fontSize.value = cached.calculatedFontSize + manualAdjust.value
    storedColWidth.value = cached.colWidth
    storedAvailableHeight.value = cached.availableHeight
    currentPage.value = 1
    return
  }

  // Hide during measurement to prevent flickering
  wrapper.style.visibility = 'hidden'

  // ─── DOM READ #1 ─────────────────────────────────────────────────────────────
  // Set 2-column layout and await Vue's DOM update to get accurate column dimensions.
  // This is the only DOM-blocked step for the 2-column path; all searches after
  // this are pure Pretext arithmetic with zero reflows.
  columnCount.value = 2
  allLines.value = collapsed
  linesPerPage.value = collapsed.length
  totalPages.value = 1
  currentPage.value = 1
  await nextTick()

  const colEl = wrapper.querySelector('.lyrics-col')
  const availableHeight = colEl?.clientHeight ?? wrapper.clientHeight
  const colWidth2 = colEl?.clientWidth ?? wrapper.clientWidth / 2
  storedAvailableHeight.value = availableHeight

  // ─── 2-COLUMN SEARCH (pure Pretext, zero DOM reads) ─────────────────────────
  let lines2 = collapsed
  let best2 = findBestFont(firstColLines(collapsed, 2), colWidth2, availableHeight)

  if (best2 >= MIN_FONT) {
    if (mergeMode.value) {
      const merged = mergeShortLines(collapsed, best2, colWidth2)
      if (merged.length < collapsed.length) {
        const best2m = findBestFont(firstColLines(merged, 2), colWidth2, availableHeight)
        if (best2m >= MIN_FONT) {
          lines2 = mergeShortLines(collapsed, best2m, colWidth2)
          best2 = best2m
        }
      }
    }
    allLines.value = lines2
    linesPerPage.value = lines2.length
    storedColWidth.value = colWidth2
    calculatedFontSize.value = best2
    fontSize.value = best2 + manualAdjust.value
    if (cacheKey) fontCache.set(cacheKey, {
      allLines: lines2, columnCount: 2, linesPerPage: lines2.length,
      totalPages: 1, calculatedFontSize: best2, colWidth: colWidth2, availableHeight,
    })
    wrapper.style.visibility = ''
    return
  }

  // ─── DOM READ #2 ─────────────────────────────────────────────────────────────
  // Switch to 3-column layout for one more dimension read.
  columnCount.value = 3
  allLines.value = collapsed
  linesPerPage.value = collapsed.length
  await nextTick()

  const colWidth3 = wrapper.querySelector('.lyrics-col')?.clientWidth ?? wrapper.clientWidth / 3

  // ─── 3-COLUMN SEARCH (pure Pretext, zero DOM reads) ─────────────────────────
  let lines3 = collapsed
  let best3 = findBestFont(firstColLines(collapsed, 3), colWidth3, availableHeight)

  if (best3 >= MIN_FONT) {
    if (mergeMode.value) {
      const merged = mergeShortLines(collapsed, best3, colWidth3)
      if (merged.length < collapsed.length) {
        const best3m = findBestFont(firstColLines(merged, 3), colWidth3, availableHeight)
        if (best3m >= MIN_FONT) {
          lines3 = mergeShortLines(collapsed, best3m, colWidth3)
          best3 = best3m
        }
      }
    }
    allLines.value = lines3
    linesPerPage.value = lines3.length
    storedColWidth.value = colWidth3
    calculatedFontSize.value = best3
    fontSize.value = best3 + manualAdjust.value
    if (cacheKey) fontCache.set(cacheKey, {
      allLines: lines3, columnCount: 3, linesPerPage: lines3.length,
      totalPages: 1, calculatedFontSize: best3, colWidth: colWidth3, availableHeight,
    })
    wrapper.style.visibility = ''
    return
  }

  // ─── MULTI-PAGE with 3 columns (pure Pretext, zero DOM reads) ───────────────
  // colWidth3 is already known; iterate page counts until lines fit.
  storedColWidth.value = colWidth3
  allLines.value = collapsed

  for (let pages = 2; pages <= 10; pages++) {
    const perCol = Math.ceil(collapsed.length / (3 * pages))
    const pageFirstCol = collapsed.slice(0, perCol)
    const best = findBestFont(pageFirstCol, colWidth3, availableHeight)

    if (best >= MIN_FONT) {
      linesPerPage.value = perCol * 3
      totalPages.value = pages
      currentPage.value = 1
      calculatedFontSize.value = best
      fontSize.value = best + manualAdjust.value
      if (cacheKey) fontCache.set(cacheKey, {
        allLines: collapsed, columnCount: 3, linesPerPage: perCol * 3,
        totalPages: pages, calculatedFontSize: best, colWidth: colWidth3, availableHeight,
      })
      wrapper.style.visibility = ''
      return
    }
  }

  // Absolute fallback
  fontSize.value = MIN_FONT
  calculatedFontSize.value = MIN_FONT
  linesPerPage.value = Math.ceil(collapsed.length / 3) * 3
  wrapper.style.visibility = ''
}

// Lightweight recheck: adjust page count at current font size (both up and down).
// Fully synchronous — uses stored dimensions from the last calculate() call,
// so no DOM reads or nextTick needed.
function recheckPages() {
  const colWidth = storedColWidth.value
  const availableHeight = storedAvailableHeight.value
  if (!colWidth || !availableHeight || !allLines.value.length) return

  const cols = columnCount.value
  const currentFont = fontSize.value

  // Check if the current first-column fits at the current font size.
  // As in findBestFont: prepare non-empty lines individually so empty lines
  // contribute 0 height (matching their 0-height DOM rendering).
  function colFits(pages) {
    const perCol = Math.ceil(allLines.value.length / (cols * pages))
    const pageLines = allLines.value.slice(0, perCol)
    if (!pageLines.length) return true
    const scaledWidth = colWidth * REF_PX / currentFont
    const refLineHeight = REF_PX * LINE_HEIGHT_RATIO
    let totalVisualLines = 0
    for (const line of pageLines) {
      if (!line.trim()) continue  // empty lines = 0 height in DOM
      totalVisualLines += layout(prepare(line, FONT_SPEC), scaledWidth, refLineHeight).lineCount
    }
    return totalVisualLines * currentFont * LINE_HEIGHT_RATIO <= availableHeight
  }

  if (!colFits(totalPages.value)) {
    // Overflowing — add pages until it fits
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
    // Try to reduce pages (font was decreased)
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

// Keyboard: arrow keys for pages, +/- for font size
function onKeydown(e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
  // Don't capture keys when an overlay is open
  if (props.overlayOpen) return

  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
    if (totalPages.value <= 1) return
    e.preventDefault()
    if (currentPage.value < totalPages.value) currentPage.value++
  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
    if (totalPages.value <= 1) return
    e.preventDefault()
    if (currentPage.value > 1) currentPage.value--
  } else if (e.key === '=' || e.key === '+') {
    e.preventDefault()
    manualAdjust.value++
    fontSize.value = calculatedFontSize.value + manualAdjust.value
    emit('adjust-changed', manualAdjust.value)
    nextTick(() => recheckPages())
  } else if (e.key === '-' || e.key === '_') {
    e.preventDefault()
    if (fontSize.value > 8) {
      manualAdjust.value--
      fontSize.value = calculatedFontSize.value + manualAdjust.value
      emit('adjust-changed', manualAdjust.value)
      nextTick(() => recheckPages())
    }
  } else if (e.key === 'm' || e.key === 'M') {
    e.preventDefault()
    mergeMode.value = !mergeMode.value
    emit('merge-changed', mergeMode.value)
    nextTick(() => calculate())
  } else if (e.key === 'l' || e.key === 'L') {
    e.preventDefault()
    showSeparators.value = !showSeparators.value
    emit('separators-changed', showSeparators.value)
  } else if (e.key === 'h' || e.key === 'H') {
    e.preventDefault()
    showAltColors.value = !showAltColors.value
    emit('alt-colors-changed', showAltColors.value)
  }
}

watch(() => props.lyrics, () => {
  manualAdjust.value = props.initialAdjust || 0
  mergeMode.value = props.initialMerge || false
  showSeparators.value = props.initialSeparators || false
  showAltColors.value = props.initialAltColors !== false
  if (props.lyrics) {
    nextTick(() => calculate())
  } else {
    allLines.value = []
    currentPage.value = 1
    totalPages.value = 1
  }
})

watch(() => props.initialMerge, (val) => {
  mergeMode.value = val || false
  if (props.lyrics) nextTick(() => calculate())
})

watch(() => props.initialSeparators, (val) => {
  showSeparators.value = val || false
})

watch(() => props.initialAltColors, (val) => {
  showAltColors.value = val !== false
})

let resizeTimer = null
function onResize() {
  fontCache.clear()
  clearTimeout(resizeTimer)
  resizeTimer = setTimeout(() => {
    if (props.lyrics) calculate()
  }, 150)
}

useEventListener(window, 'resize', onResize)
useEventListener(window, 'keydown', onKeydown)

onMounted(() => {
  if (props.lyrics) nextTick(() => calculate())
})

function adjustFont(delta) {
  if (delta > 0 || fontSize.value > 8) {
    manualAdjust.value += delta
    fontSize.value = calculatedFontSize.value + manualAdjust.value
    emit('adjust-changed', manualAdjust.value)
    nextTick(() => recheckPages())
  }
}

function resetFont() {
  manualAdjust.value = 0
  fontSize.value = calculatedFontSize.value
  emit('adjust-changed', 0)
  nextTick(() => recheckPages())
}

defineExpose({ totalPages, currentPage, adjustFont, resetFont })
</script>

<style scoped>
.lyrics-wrapper {
  width: 100%;
  height: 100%;
  padding: 3rem 3rem;
  overflow: hidden;
  position: relative;
}

.lyrics-columns {
  display: flex;
  gap: 3rem;
  height: 100%;
  line-height: 1.45;
  padding-top: 0.3125rem;
}

.lyrics-columns.cols-3 {
  gap: 2rem;
}

.lyrics-col {
  flex: 1;
  min-width: 0;
}

.lyric-line {
  white-space: pre-wrap;
  word-wrap: break-word;
}

.lyric-line.alt {
  color: rgba(250, 240, 200, 0.85);
}

.lyric-line.empty {
  height: 1px;
  width: 3.75rem;
  margin-left: -2rem;
  background: rgba(255, 255, 255, 0.59);
}

.lyric-line.empty:first-child,
.lyric-line.empty:last-child {
  display: none;
}
</style>
