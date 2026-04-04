import { describe, it, expect } from 'vitest'

/**
 * Tests for LyricsDisplay.vue logic — extracted and tested directly.
 *
 * Since LyricsDisplay renders to a canvas and depends on browser APIs
 * (canvas context, font metrics) we test the pure utility algorithms
 * extracted from the component source.
 *
 * Not tested here (require canvas/Pretext): findBestFont, mergeShortLines,
 * recheckPages, draw().
 */

// --- Extracted: djb2 hash (from getCacheKey) ---
function djb2(str) {
  let h = 5381
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0
  return h
}

// --- Extracted: computeGeometryPure (from computeGeometryPure) ---
// Pure arithmetic — no DOM. Matches the constants in LyricsDisplay.vue exactly:
// padding: 3rem H + 3rem V + 0.3125rem top extra + 0.5rem bottom buffer; gap: 3rem (2-col) / 2rem (3-col).
function computeGeometryPure(W, H, remPx, cols) {
  const paddingH = 3 * remPx
  const paddingV = 3 * remPx
  const paddingTopExtra = 0.3125 * remPx
  const paddingBottomExtra = 0.5 * remPx
  const gap = cols === 3 ? 2 * remPx : 3 * remPx
  const colW = (W - 2 * paddingH - (cols - 1) * gap) / cols
  const availH = H - 2 * paddingV - paddingTopExtra - paddingBottomExtra
  return { W, H, remPx, paddingH, paddingV, paddingTopExtra, gap, colW, availH }
}

// --- Extracted: collapse repeats (from collapseRepeats) ---
// Collapses any run of 2+ identical consecutive lines into "line (xN)"
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

describe('djb2 hash', () => {
  it('produces consistent hashes for the same input', () => {
    expect(djb2('hello')).toBe(djb2('hello'))
    expect(djb2('test lyrics')).toBe(djb2('test lyrics'))
  })

  it('produces different hashes for different content', () => {
    expect(djb2('Song A lyrics')).not.toBe(djb2('Song B lyrics'))
  })

  it('produces different hashes for same-length different content', () => {
    // This is the key fix — lyrics.length would give the same cache key
    expect(djb2('abc')).not.toBe(djb2('xyz'))
    expect(djb2('AAAA')).not.toBe(djb2('BBBB'))
  })

  it('handles empty string', () => {
    expect(djb2('')).toBe(5381) // initial hash value
  })

  it('returns a 32-bit unsigned integer', () => {
    const hash = djb2('some long string with various characters!@#$%^&*()')
    expect(hash).toBeGreaterThanOrEqual(0)
    expect(hash).toBeLessThanOrEqual(0xFFFFFFFF)
  })
})

describe('computeGeometryPure', () => {
  const remPx = 16 // 1rem = 16px (browser default)
  const W = 1920
  const H = 1080

  it('2-column: colW accounts for 2×paddingH + 1 gap (3rem)', () => {
    const g = computeGeometryPure(W, H, remPx, 2)
    const expectedColW = (W - 2 * 3 * remPx - 1 * 3 * remPx) / 2
    expect(g.colW).toBeCloseTo(expectedColW)
    expect(g.gap).toBe(3 * remPx)
  })

  it('3-column: colW accounts for 2×paddingH + 2 gaps (2rem each)', () => {
    const g = computeGeometryPure(W, H, remPx, 3)
    const expectedColW = (W - 2 * 3 * remPx - 2 * 2 * remPx) / 3
    expect(g.colW).toBeCloseTo(expectedColW)
    expect(g.gap).toBe(2 * remPx)
  })

  it('availH subtracts 2×paddingV + paddingTopExtra + paddingBottomExtra', () => {
    const g = computeGeometryPure(W, H, remPx, 2)
    const expectedAvailH = H - 2 * 3 * remPx - 0.3125 * remPx - 0.5 * remPx
    expect(g.availH).toBeCloseTo(expectedAvailH)
  })

  it('3-col colW is narrower than 2-col colW for same viewport', () => {
    const g2 = computeGeometryPure(W, H, remPx, 2)
    const g3 = computeGeometryPure(W, H, remPx, 3)
    expect(g3.colW).toBeLessThan(g2.colW)
  })

  it('passes raw dimensions through unchanged', () => {
    const g = computeGeometryPure(1280, 900, remPx, 2)
    expect(g.W).toBe(1280)
    expect(g.H).toBe(900)
    expect(g.remPx).toBe(remPx)
  })
})

describe('collapseRepeats', () => {
  it('collapses 4 consecutive identical lines', () => {
    const result = collapseRepeats(['oh', 'oh', 'oh', 'oh'])
    expect(result).toEqual(['oh (x4)'])
  })

  it('collapses 3 consecutive identical lines', () => {
    const result = collapseRepeats(['oh', 'oh', 'oh', 'yeah'])
    expect(result).toEqual(['oh (x3)', 'yeah'])
  })

  it('collapses 2 consecutive identical lines', () => {
    // count > 1 threshold — pairs collapse too
    const result = collapseRepeats(['oh', 'oh', 'yeah'])
    expect(result).toEqual(['oh (x2)', 'yeah'])
  })

  it('does not collapse a single line', () => {
    const result = collapseRepeats(['oh', 'yeah'])
    expect(result).toEqual(['oh', 'yeah'])
  })

  it('preserves empty lines and does not collapse across them', () => {
    const result = collapseRepeats(['line', '', 'line'])
    expect(result).toEqual(['line', '', 'line'])
  })

  it('handles mixed collapsed and normal', () => {
    const result = collapseRepeats(['a', 'b', 'b', 'b', 'c'])
    expect(result).toEqual(['a', 'b (x3)', 'c'])
  })

  it('handles empty input', () => {
    expect(collapseRepeats([])).toEqual([])
  })

  it('handles all identical lines', () => {
    const result = collapseRepeats(['na', 'na', 'na', 'na', 'na'])
    expect(result).toEqual(['na (x5)'])
  })
})
