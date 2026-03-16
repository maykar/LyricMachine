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
          v-for="(line, li) in col"
          :key="li"
          class="lyric-line"
          :class="{ alt: showAltColors && isAltLine(col, li), empty: showSeparators && !line.trim() }"
        >{{ line }}</div>
      </div>
    </div>

    <!-- Hidden measurement element for merge checks -->
    <span ref="mergeRef" class="merge-measure" aria-hidden="true"></span>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { useEventListener } from '@vueuse/core'

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
const mergeRef = ref(null)

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

const MAX_FONT = 80
const MIN_FONT = 20

// --- Font size cache: skip binary search on revisit ---
const fontCache = new Map()

function getCacheKey(lyrics, merge) {
  const wrapper = wrapperRef.value
  if (!wrapper) return null
  return `${lyrics.length}:${wrapper.clientWidth}x${wrapper.clientHeight}:${merge ? 1 : 0}`
}

// Count only non-empty lines for alternating colors (skip blank separators)
function isAltLine(col, index) {
  if (!col[index]?.trim()) return false
  let count = 0
  for (let i = 0; i < index; i++) {
    if (col[i]?.trim()) count++
  }
  return count % 2 === 1
}

// Build columns for the current page
const visibleColumns = computed(() => {
  const cols = columnCount.value
  const perPage = linesPerPage.value
  if (!perPage) return []
  const start = (currentPage.value - 1) * perPage
  const pageLines = allLines.value.slice(start, start + perPage)
  const perCol = Math.ceil(perPage / cols)

  const result = []
  for (let c = 0; c < cols; c++) {
    result.push(pageLines.slice(c * perCol, (c + 1) * perCol))
  }
  return result
})

// Check if any column's content overflows the wrapper
function hasOverflow() {
  const wrapper = wrapperRef.value
  if (!wrapper) return false
  const cols = wrapper.querySelectorAll('.lyrics-col')
  for (const col of cols) {
    if (col.scrollHeight > col.clientHeight + 2) return true
  }
  return false
}

// Binary search for the largest font that doesn't overflow
async function findFittingFont(lines, cols) {
  columnCount.value = cols
  const perCol = Math.ceil(lines.length / cols)
  linesPerPage.value = perCol * cols
  totalPages.value = 1
  currentPage.value = 1

  let lo = MIN_FONT, hi = MAX_FONT, best = 0

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2)
    fontSize.value = mid
    await nextTick()

    if (!hasOverflow()) {
      best = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }

  return best
}
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

// Merge consecutive non-empty lines that fit side-by-side at the given font/colWidth
function mergeShortLines(lines, fontSizePx, colWidth) {
  const el = mergeRef.value
  if (!el) return lines

  el.style.fontSize = fontSizePx + 'px'
  el.style.fontFamily = "'Inter', system-ui, -apple-system, sans-serif"
  el.style.whiteSpace = 'nowrap'

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
      el.textContent = candidate
      if (el.offsetWidth <= colWidth) {
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
    currentPage.value = 1
    return
  }

  // Hide during measurement to prevent flickering
  wrapper.style.visibility = 'hidden'

  // Helper: get actual column width from the DOM
  function getColWidth() {
    const col = wrapper.querySelector('.lyrics-col')
    return col ? col.clientWidth : wrapper.clientWidth / 2
  }

  // 1) Try 2 columns — first without merge, then with
  allLines.value = collapsed
  let best2 = await findFittingFont(collapsed, 2)
  if (best2 >= MIN_FONT) {
    if (mergeMode.value) {
      const colW = getColWidth()
      const merged = mergeShortLines(collapsed, best2, colW)
      if (merged.length < collapsed.length) {
        allLines.value = merged
        const best2m = await findFittingFont(merged, 2)
        if (best2m >= MIN_FONT) {
          const finalMerged = mergeShortLines(collapsed, best2m, getColWidth())
          allLines.value = finalMerged
          best2 = best2m
        }
      }
    }
    calculatedFontSize.value = best2
    fontSize.value = best2 + manualAdjust.value
    if (cacheKey) fontCache.set(cacheKey, { allLines: allLines.value, columnCount: columnCount.value, linesPerPage: linesPerPage.value, totalPages: totalPages.value, calculatedFontSize: best2 })
    wrapper.style.visibility = ''
    return
  }

  // 2) Try 3 columns
  allLines.value = collapsed
  let best3 = await findFittingFont(collapsed, 3)
  if (best3 >= MIN_FONT) {
    if (mergeMode.value) {
      const colW = getColWidth()
      const merged = mergeShortLines(collapsed, best3, colW)
      if (merged.length < collapsed.length) {
        allLines.value = merged
        const best3m = await findFittingFont(merged, 3)
        if (best3m >= MIN_FONT) {
          const finalMerged = mergeShortLines(collapsed, best3m, getColWidth())
          allLines.value = finalMerged
          best3 = best3m
        }
      }
    }
    calculatedFontSize.value = best3
    fontSize.value = best3 + manualAdjust.value
    if (cacheKey) fontCache.set(cacheKey, { allLines: allLines.value, columnCount: columnCount.value, linesPerPage: linesPerPage.value, totalPages: totalPages.value, calculatedFontSize: best3 })
    wrapper.style.visibility = ''
    return
  }

  // 3) Multi-page with 3 columns
  columnCount.value = 3
  for (let pages = 2; pages <= 10; pages++) {
    const perCol = Math.ceil(collapsed.length / (3 * pages))
    linesPerPage.value = perCol * 3
    totalPages.value = pages
    currentPage.value = 1

    let lo = MIN_FONT, hi = MAX_FONT, best = 0
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2)
      fontSize.value = mid
      await nextTick()

      if (!hasOverflow()) {
        best = mid
        lo = mid + 1
      } else {
        hi = mid - 1
      }
    }

    if (best >= MIN_FONT) {
      calculatedFontSize.value = best
      fontSize.value = best + manualAdjust.value
      if (cacheKey) fontCache.set(cacheKey, { allLines: allLines.value, columnCount: columnCount.value, linesPerPage: linesPerPage.value, totalPages: totalPages.value, calculatedFontSize: best })
      wrapper.style.visibility = ''
      return
    }
  }

  // Absolute fallback
  fontSize.value = MIN_FONT
  calculatedFontSize.value = MIN_FONT
  wrapper.style.visibility = ''
}

// Lightweight recheck: adjust page count at current font size (both up and down)
async function recheckPages() {
  const cols = columnCount.value

  // First: if current layout overflows, add pages
  await nextTick()
  while (hasOverflow() && totalPages.value < 10) {
    const newPages = totalPages.value + 1
    const perCol = Math.ceil(allLines.value.length / (cols * newPages))
    linesPerPage.value = perCol * cols
    totalPages.value = newPages
    currentPage.value = Math.min(currentPage.value, newPages)
    await nextTick()
  }

  // Then: try reducing pages
  while (totalPages.value > 1) {
    const tryPages = totalPages.value - 1
    const perCol = Math.ceil(allLines.value.length / (cols * tryPages))
    const savedLPP = linesPerPage.value
    const savedTP = totalPages.value
    linesPerPage.value = perCol * cols
    totalPages.value = tryPages
    currentPage.value = Math.min(currentPage.value, tryPages)
    await nextTick()

    if (hasOverflow()) {
      // Doesn't fit — revert
      linesPerPage.value = savedLPP
      totalPages.value = savedTP
      currentPage.value = Math.min(currentPage.value, savedTP)
      break
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
  padding-top: 5px;
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
  width: 60px;
  margin-left: -2rem;
  background: rgba(255, 255, 255, 0.59);
}

.lyric-line.empty:first-child,
.lyric-line.empty:last-child {
  display: none;
}

.merge-measure {
  position: absolute;
  visibility: hidden;
  pointer-events: none;
  top: 0;
  left: 0;
}
</style>
