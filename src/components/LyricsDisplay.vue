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
  initialMergeAggressive: { type: Boolean, default: false },
  initialCollapseChorus: { type: Boolean, default: false },
  initialSeparators: { type: Boolean, default: false },
  initialAltColors: { type: Boolean, default: true },
  overlayOpen: { type: Boolean, default: false },
})

const emit = defineEmits([
  'adjust-changed',
  'merge-changed',
  'merge-aggressive-changed',
  'collapse-chorus-changed',
  'separators-changed',
  'alt-colors-changed'
])

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
const mergeMode = ref(props.initialMerge || false)
const mergeAggressiveMode = ref(props.initialMergeAggressive || false)
const collapseChorusMode = ref(props.initialCollapseChorus || false)
const showSeparators = ref(props.initialSeparators || false)
const showAltColors = ref(props.initialAltColors !== false)

// Constants
const MAX_FONT = 80
const MIN_FONT = 20
const REF_PX = 16
const FONT_SPEC = `${REF_PX}px Inter`
const LINE_HEIGHT_RATIO = 1.45
const ALT_COLOR = 'rgba(250,240,200,0.85)'
const SEP_COLOR = 'rgba(255,255,255,0.59)'

const CHORUS_COLORS = [
  '#ff5c8a', // 1: Monokai Pink (Lighter)
  '#48dcf0', // 2: Monokai Cyan (Lighter)
  '#bde65c', // 3: Monokai Green (Lighter)
  '#ffa84c', // 4: Monokai Orange (Lighter)
  '#c4a1ff', // 5: Monokai Purple (Lighter)
  '#f0e68c', // 6: Monokai Yellow (Lighter)
  '#9fb2ff', // 7: Monokai Blue (Lighter)
  '#f2706e'  // 8: Monokai Coral (Lighter)
]

const CHORUS_COLORS_ALT = [
  '#ffb3c6', // 1: Lighter Pink
  '#adebf6', // 2: Lighter Cyan
  '#dff2af', // 3: Lighter Green
  '#ffd8b3', // 4: Lighter Orange
  '#e4d4ff', // 5: Lighter Purple
  '#f7f4ce', // 6: Lighter Yellow
  '#d6deff', // 7: Lighter Blue
  '#f9bab9'  // 8: Lighter Coral
]

const META_START = '\uE000'
const META_END = '\uE001'

function getLineMeta(line) {
  if (typeof line === 'string' && line.startsWith(META_START)) {
    const end = line.indexOf(META_END)
    if (end !== -1) {
      const meta = line.slice(1, end)
      const splits = meta.split('_')
      return { 
        colorId: parseInt(splits[0], 10), 
        isRepeat: splits[1] === '1', 
        pureText: line.slice(end + 1), 
        prefix: line.slice(0, end + 1) 
      }
    }
  }
  return { colorId: 0, isRepeat: false, pureText: line, prefix: '' }
}

function getPureText(line) {
  return getLineMeta(line).pureText
}

// Caches
const fontCache = new Map()       // layout results keyed by (lyricsHash × dims × merge)
const prepareCache = new Map()    // prepare() results keyed by line text (font-size-independent)
const segmentsCache = new Map()   // prepareWithSegments keyed by line text
const SEGMENTS_CACHE_MAX = 2000   // LRU cap — clear all when exceeded

// ─── Widow prevention ─────────────────────────────────────────────────────────
// A "widow" is ≤ WIDOW_THRESHOLD words dangling alone on the last wrapped line.
// Pass 1: prefer natural break points (comma, semicolon, colon, dash) — take
//         the latest one where both halves still fit on a single visual line.
// Pass 2: no punctuation? Move the minimum number of words from line 1 to line 2
//         needed to push the last line over the widow threshold.
const WIDOW_THRESHOLD = 2
const WIDOW_BREAK_RE = /[,;:—–]\s*/g

function fixWidow(originalText, vlines, scaledColW) {
  if (vlines.length !== 2) return vlines  // only the simple 2-line wrap case
  const widowWords = vlines[1].text.trim().split(/\s+/).length
  if (widowWords > WIDOW_THRESHOLD) return vlines

  const lhRatio = REF_PX * LINE_HEIGHT_RATIO

  // ── Pass 1: natural punctuation break points ─────────────────────────────
  let bestSplit = null
  for (const match of originalText.matchAll(WIDOW_BREAK_RE)) {
    const part1 = originalText.slice(0, match.index + 1).trim()
    const part2 = originalText.slice(match.index + match[0].length).trim()
    if (!part2) continue

    const { lines: v1 } = layoutWithLines(prepareWithSegments(part1, FONT_SPEC), scaledColW, lhRatio)
    if (v1.length !== 1) break // part1 wraps — later commas (more text) will be worse

    const { lines: v2 } = layoutWithLines(prepareWithSegments(part2, FONT_SPEC), scaledColW, lhRatio)
    if (v2.length !== 1) continue // part2 still wraps

    if (v2[0].text.trim().split(/\s+/).length <= widowWords) continue // not an improvement

    bestSplit = [...v1, ...v2] // keep iterating — later comma = longer line 1 (preferred)
  }
  if (bestSplit) return bestSplit

  // ── Pass 2: word-boundary fallback ───────────────────────────────────────
  // Move the minimum number of words from line 1 to line 2 so that line 2
  // has WIDOW_THRESHOLD + 1 words (just enough to no longer be a widow).
  const words = originalText.trim().split(/\s+/)
  const targetLine2 = WIDOW_THRESHOLD + 1
  const splitIdx = words.length - targetLine2
  if (splitIdx < 1) return vlines // not enough words to split meaningfully

  const part1 = words.slice(0, splitIdx).join(' ')
  const part2 = words.slice(splitIdx).join(' ')

  // part2 only has targetLine2 words — almost certainly fits, but verify
  const { lines: v2 } = layoutWithLines(prepareWithSegments(part2, FONT_SPEC), scaledColW, lhRatio)
  if (v2.length !== 1) return vlines

  // part1 is shorter than pretext's line 1 so it definitely fits, but sanity check
  const { lines: v1 } = layoutWithLines(prepareWithSegments(part1, FONT_SPEC), scaledColW, lhRatio)
  if (v1.length !== 1) return vlines

  return [...v1, ...v2]
}

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
let recalcPending = false // set whenever layout must be recalculated (resize OR state change)
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
function getCacheKey(lyrics, merge, mergeAgg, collapseCol) {
  const wrapper = wrapperRef.value
  if (!wrapper) return null
  let h = 5381
  for (let i = 0; i < lyrics.length; i++) h = ((h << 5) + h + lyrics.charCodeAt(i)) >>> 0
  return `${h}:${wrapper.clientWidth}x${wrapper.clientHeight}:${merge ? 1 : 0}:${mergeAgg ? 1 : 0}:${collapseCol ? 1 : 0}`
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
    let first = raw.findIndex(l => getPureText(l).trim())
    if (first === -1) continue
    let last = raw.length - 1
    while (last > first && !getPureText(raw[last]).trim()) last--
    let n = 0
    for (let i = first; i <= last; i++) {
      const pure = getPureText(raw[i])
      if (!pure.trim()) continue
      let p = prepareCache.get(pure)
      if (!p) { p = prepare(pure, FONT_SPEC); prepareCache.set(pure, p) }
      n += layout(p, scaledW, refLH).lineCount
    }
    if (n > maxLines) maxLines = n
  }
  return maxLines
}

function findBestFont(allLines, cols, colWidth, availableHeight) {
  if (!allLines.some(l => getPureText(l).trim())) return MAX_FONT
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

function mergeShortLines(lines, fontSizePx, colWidth, aggressive = false) {
  if (aggressive) {
    const result = []
    let currentParagraph = []
    for (const line of lines) {
      if (!getPureText(line).trim()) {
        if (currentParagraph.length) {
          result.push(currentParagraph[0].prefix + currentParagraph.map(l => l.pureText).join(' - '))
          currentParagraph = []
        }
        result.push(line)
      } else {
        currentParagraph.push(getLineMeta(line))
      }
    }
    if (currentParagraph.length) result.push(currentParagraph[0].prefix + currentParagraph.map(l => l.pureText).join(' - '))
    return result
  }

  const result = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!getPureText(line).trim()) { result.push(line); i++; continue }
    const hasRepeat = /\(x\d+\)$/.test(getPureText(line))
    const nextHasRepeat = i + 1 < lines.length && /\(x\d+\)$/.test(getPureText(lines[i + 1]))
    if (!hasRepeat && !nextHasRepeat && i + 1 < lines.length && getPureText(lines[i + 1]).trim() && getLineMeta(line).colorId === getLineMeta(lines[i + 1]).colorId) {
      const pure1 = getPureText(line)
      const pure2 = getPureText(lines[i + 1])
      const candidatePure = pure1 + ' - ' + pure2
      let p = prepareCache.get(candidatePure)
      if (!p) { p = prepare(candidatePure, FONT_SPEC); prepareCache.set(candidatePure, p) }
      const { lineCount } = layout(p, colWidth * REF_PX / fontSizePx, REF_PX * LINE_HEIGHT_RATIO)
      if (lineCount === 1) { 
        result.push(getLineMeta(line).prefix + candidatePure)
        i += 2; 
        continue 
      }
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
    if (!getPureText(line).trim()) { result.push(line); i++; continue }
    
    let count = 1
    let peek = i + 1
    let lastMatchIdx = i
    
    while (peek < lines.length) {
      if (!getPureText(lines[peek]).trim()) {
        peek++
        continue
      }
      
      if (getPureText(lines[peek]) === getPureText(line) && getLineMeta(lines[peek]).colorId === getLineMeta(line).colorId) {
        count++
        lastMatchIdx = peek
        peek++
      } else {
        break
      }
    }
    
    if (count > 1) {
      const { prefix, pureText } = getLineMeta(line)
      result.push(`${prefix}${pureText} (x${count})`)
      i = lastMatchIdx + 1
    } else {
      result.push(line)
      i++
    }
  }
  return result
}

/**
 * Detect alternating text/blank/text/blank noise patterns.
 * If 3+ consecutive text lines are each separated by a single blank,
 * those blanks are formatting artefacts — strip them.
 */
function collapseNoiseBlanks(lines) {
  // Tag each line: true = non-empty, false = blank
  const isText = lines.map(l => l.trim() !== '')
  // Find runs of the pattern: text, blank, text, blank, text...
  // Track which blank indices are "noise" — part of a run of 3+ text lines
  const noiseBlanks = new Set()
  let i = 0
  while (i < lines.length) {
    // [Repeat] tags and blanks are not "normal text" for run detection
    if (!isText[i] || lines[i].includes(META_START)) { i++; continue }
    // Start of a potential alternating run — collect text indices and blank indices
    const runBlanks = []
    let textCount = 1
    let j = i + 1
    while (j < lines.length) {
      if (!isText[j] && j + 1 < lines.length && isText[j + 1] && !lines[j + 1].includes(META_START)) {
        // blank followed by normal text — continue the run
        runBlanks.push(j)
        textCount++
        j += 2
      } else {
        break
      }
    }
    if (textCount >= 3) {
      // If a blank or [Repeat] already precedes this run, strip ALL noise blanks.
      // Otherwise keep the first one as the section separator.
      const alreadySeparated = i === 0 || !isText[i - 1] || lines[i - 1].includes(META_START)
      const startK = alreadySeparated ? 0 : 1
      for (let k = startK; k < runBlanks.length; k++) noiseBlanks.add(runBlanks[k])
    }
    i = j
  }
  if (noiseBlanks.size === 0) return lines
  return lines.filter((_, idx) => !noiseBlanks.has(idx))
}

function diceCoefficient(s1, s2) {
  s1 = s1.toLowerCase().replace(/[^a-z0-9]/g, '')
  s2 = s2.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (s1 === s2) return 1
  if (s1.length < 2 || s2.length < 2) return 0
  
  let bigrams2 = new Map()
  for (let i = 0; i < s2.length - 1; i++) {
    const bg = s2.slice(i, i + 2)
    bigrams2.set(bg, (bigrams2.get(bg) || 0) + 1)
  }
  
  let matches = 0
  for (let i = 0; i < s1.length - 1; i++) {
    const bg = s1.slice(i, i + 2)
    const count = bigrams2.get(bg) || 0
    if (count > 0) {
      matches++
      bigrams2.set(bg, count - 1)
    }
  }
  return (2.0 * matches) / (s1.length - 1 + s2.length - 1)
}

function insertImplicitBreaks(lines) {
  const boundaries = new Set()
  const RUN_LEN = 4
  
  for (let i = 0; i <= lines.length - RUN_LEN; i++) {
    if (!lines[i] || !getPureText(lines[i]).trim()) continue
    for (let j = i + 1; j <= lines.length; j++) {
      if (!lines[j] || !getPureText(lines[j]).trim()) continue
      
      if (i > 0 && j > 0 && getPureText(lines[i-1]).trim() && getPureText(lines[j-1]).trim() && 
          diceCoefficient(getPureText(lines[i-1]), getPureText(lines[j-1])) >= 0.75) {
        continue
      }
      
      let k = 0
      while (i + k < lines.length && j + k < lines.length && i + k < j && 
             getPureText(lines[i+k]).trim() && getPureText(lines[j+k]).trim() && 
             diceCoefficient(getPureText(lines[i+k]), getPureText(lines[j+k])) >= 0.75) {
        k++
      }
      
      if (k >= RUN_LEN) {
        boundaries.add(i)
        boundaries.add(i + k)
        boundaries.add(j)
        boundaries.add(j + k)
      }
    }
  }

  const chunked = []
  for (let i = 0; i < lines.length; i++) {
    if (boundaries.has(i) && chunked.length > 0 && getPureText(chunked[chunked.length - 1]).trim() !== '') {
      chunked.push('')
    }
    chunked.push(lines[i])
  }
  return chunked
}

function collapseChoruses(lines) {
  lines = insertImplicitBreaks(lines)
  
  const result = []
  const paragraphs = []
  let currentBlock = []
  let currentStart = 0
  for (let i = 0; i <= lines.length; i++) {
    const line = lines[i]
    if (i === lines.length || !line.trim()) {
      if (currentBlock.length > 0) {
        paragraphs.push({ text: currentBlock.join('\n'), lines: currentBlock, start: currentStart, end: i - 1 })
        currentBlock = []
      }
      currentStart = i + 1
    } else {
      currentBlock.push(line)
    }
  }

  let nextId = 1
  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i]
    if (p.lines.length < 2) continue
    
    let matchedEarlier = null
    for (let j = 0; j < i; j++) {
      const prev = paragraphs[j]
      if (prev.lines.length < 2) continue
      
      let matches = 0
      for (const l1 of p.lines) {
        if (prev.lines.some(l2 => diceCoefficient(l1, l2) >= 0.75)) matches++
      }
      const sim = matches / Math.max(p.lines.length, prev.lines.length)
      if (sim >= 0.65) {
        matchedEarlier = prev
        break
      }
    }

    if (matchedEarlier) {
      if (!matchedEarlier.chorusId) {
        matchedEarlier.chorusId = nextId++
        matchedEarlier.isFirst = true
      }
      p.chorusId = matchedEarlier.chorusId
      p.isFirst = false
    }
  }

  let idx = 0
  while (idx < lines.length) {
    const line = lines[idx]
    if (!line.trim()) {
      result.push(line)
      idx++
      continue
    }

    const para = paragraphs.find(p => p.start === idx)
    if (para && para.chorusId) {
      if (para.isFirst) {
        for (let j = 0; j < para.lines.length; j++) {
          result.push(`${META_START}${para.chorusId}_0${META_END}${para.lines[j]}`)
        }
      } else {
        result.push(`${META_START}${para.chorusId}_1${META_END}[Repeat]`)
      }
      idx = para.end + 1
      continue
    } else {
      result.push(line)
    }
    idx++
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

    if (mergeMode.value || mergeAggressiveMode.value) {
      const merged = mergeShortLines(collapsed, best, g.colW, mergeAggressiveMode.value)
      if (merged.length < collapsed.length) {
        const bestM = findBestFont(merged, cols, g.colW, g.availH)
        if (bestM >= MIN_FONT) { lines = mergeShortLines(collapsed, bestM, g.colW, mergeAggressiveMode.value); best = bestM }
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
  let collapsed = rawLines
  if (collapseChorusMode.value) collapsed = collapseChoruses(collapsed)
  collapsed = collapseRepeats(collapsed)
  // Collapse separator noise: if 3+ single text lines are each separated by
  // a single blank, those blanks are formatting noise — strip them.
  collapsed = collapseNoiseBlanks(collapsed)
  // Also deduplicate any remaining consecutive blank lines
  collapsed = collapsed.filter((line, i, arr) =>
    line.trim() !== '' || i === 0 || arr[i - 1].trim() !== ''
  )
  // Strip leading/trailing blank lines
  while (collapsed.length && !collapsed[0].trim()) collapsed.shift()
  while (collapsed.length && !collapsed[collapsed.length - 1].trim()) collapsed.pop()

  const cacheKey = getCacheKey(props.lyrics, mergeMode.value, mergeAggressiveMode.value, collapseChorusMode.value)
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

  const perPage = linesPerPage.value
  const pageStart = (currentPage.value - 1) * perPage
  const pageLines = allLines.value.slice(pageStart, pageStart + perPage)
  const perCol = Math.ceil(perPage / cols)

  let divIdx = 0
  let blockLineCount = 0
  let lastColorId = -1

  for (let c = 0; c < cols; c++) {
    const rawColLines = pageLines.slice(c * perCol, (c + 1) * perCol)
    let first = rawColLines.findIndex(l => l.trim())
    if (first === -1) continue
    let last = rawColLines.length - 1
    while (last > first && !rawColLines[last].trim()) last--
    const colLines = rawColLines.slice(first, last + 1)

    const colStartX = paddingH + c * (colW + gap)
    let y = paddingV + paddingTopExtra

    for (const line of colLines) {
      const pure = getPureText(line)
      const { colorId, isRepeat } = getLineMeta(line)
      
      if (!pure.trim()) {
        blockLineCount = 0
        lastColorId = -1
        if (showSeparators.value) {
          ensurePool(divIdx + 1)
          const el = linePool[divIdx++]
          el.style.cssText = `position:absolute;pointer-events:none;display:block;left:${colStartX - 2 * remPx}px;top:${y}px;width:${3.75 * remPx}px;height:1px;background:${SEP_COLOR}`
          el.textContent = ''
        }
        continue
      }

      if (colorId !== lastColorId) {
        blockLineCount = 0
        lastColorId = colorId
      }

      const isAlt = showAltColors.value && blockLineCount % 2 === 1 && !isRepeat
      let color = isAlt ? ALT_COLOR : cachedTextColor
      
      if (colorId > 0) {
        if (isAlt) {
          color = CHORUS_COLORS_ALT[(colorId - 1) % CHORUS_COLORS_ALT.length]
        } else {
          color = CHORUS_COLORS[(colorId - 1) % CHORUS_COLORS.length]
        }
      }

      blockLineCount++

      // Get or cache prepareWithSegments — keyed by line text only.
      // Uses REF_PX font spec + scaled colW so cache is font-size-independent.
      if (!segmentsCache.has(pure)) {
        if (segmentsCache.size >= SEGMENTS_CACHE_MAX) segmentsCache.clear()
        segmentsCache.set(pure, prepareWithSegments(pure, FONT_SPEC))
      }
      const scaledColW = colW * REF_PX / fs
      const rawVlines = layoutWithLines(segmentsCache.get(pure), scaledColW, REF_PX * LINE_HEIGHT_RATIO).lines
      const vlines = fixWidow(pure, rawVlines, scaledColW)

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

  if (recalcPending) {
    recalcPending = false
    calculate()
    // Always redraw immediately after a layout recalculation, regardless of lerp state
    displayFontSize = fontSize.value  // snap to exact target after recalc
    draw()
    return
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
  recalcPending = true
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
    recalcPending = true
    startRaf()
  } else if (e.key === '-' || e.key === '_') {
    e.preventDefault()
    if (fontSize.value > 8) {
      manualAdjust.value--
      emit('adjust-changed', manualAdjust.value)
      fontCache.clear()
      recalcPending = true
      startRaf()
    }
  } else if (e.key === 'm' || e.key === 'M') {
    e.preventDefault()
    mergeMode.value = !mergeMode.value
    emit('merge-changed', mergeMode.value)
    fontCache.clear()
    recalcPending = true
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
  mergeAggressiveMode.value = props.initialMergeAggressive || false
  collapseChorusMode.value = props.initialCollapseChorus || false
  showSeparators.value = props.initialSeparators || false
  showAltColors.value = props.initialAltColors !== false
  displayFontSize = -1
  recalcPending = true
  prepareCache.clear()
  segmentsCache.clear()
  startRaf()
})

watch(() => props.initialMerge, (val) => {
  mergeMode.value = val || false
  if (props.lyrics) { recalcPending = true; startRaf() }
})

watch(() => props.initialMergeAggressive, (val) => {
  mergeAggressiveMode.value = val || false
  if (props.lyrics) { recalcPending = true; startRaf() }
})

watch(() => props.initialCollapseChorus, (val) => {
  collapseChorusMode.value = val || false
  if (props.lyrics) { recalcPending = true; startRaf() }
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
    recalcPending = true
    startRaf()
  })
  // Wait for Inter font before first layout so measurements are accurate
  document.fonts.ready.then(() => {
    if (wrapperRef.value) resizeObserver.observe(wrapperRef.value)
    recalcPending = true
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
    recalcPending = true
    startRaf()
  }
}

function resetFont() {
  manualAdjust.value = 0
  emit('adjust-changed', 0)
  fontCache.clear()
  recalcPending = true
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
    recalcPending = true
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
