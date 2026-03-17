import { describe, it, expect } from 'vitest'

/**
 * Tests for LyricsDisplay.vue logic — extracted and tested directly.
 *
 * Since the component has complex internal computed properties,
 * we test the algorithms (column splitting, alt-line computation, djb2 hash)
 * as standalone functions extracted from the component source.
 */

// --- Extracted: djb2 hash (from getCacheKey) ---
function djb2(str) {
  let h = 5381
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0
  return h
}

// --- Extracted: column splitting + alt-line sets (from visibleColumns computed) ---
function buildColumns(allLines, columnCount, linesPerPage, currentPage) {
  if (!linesPerPage) return []
  const start = (currentPage - 1) * linesPerPage
  const pageLines = allLines.slice(start, start + linesPerPage)
  const perCol = Math.ceil(linesPerPage / columnCount)

  const result = []
  for (let c = 0; c < columnCount; c++) {
    const colLines = pageLines.slice(c * perCol, (c + 1) * perCol)
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
}

// --- Extracted: collapse repeats ---
function collapseRepeats(lines) {
  const result = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) {
      result.push(line)
      i++
      continue
    }
    let count = 1
    while (i + count < lines.length && lines[i + count] === line) count++
    if (count >= 3) {
      result.push(`${line} (x${count})`)
      i += count
    } else {
      result.push(line)
      i++
    }
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

describe('buildColumns', () => {
  const lines = ['Line 1', 'Line 2', 'Line 3', 'Line 4', 'Line 5', 'Line 6']

  it('splits lines into 2 columns', () => {
    const cols = buildColumns(lines, 2, 6, 1)
    expect(cols).toHaveLength(2)
    expect(cols[0].lines).toEqual(['Line 1', 'Line 2', 'Line 3'])
    expect(cols[1].lines).toEqual(['Line 4', 'Line 5', 'Line 6'])
  })

  it('splits lines into 3 columns', () => {
    const cols = buildColumns(lines, 3, 6, 1)
    expect(cols).toHaveLength(3)
    expect(cols[0].lines).toEqual(['Line 1', 'Line 2'])
    expect(cols[1].lines).toEqual(['Line 3', 'Line 4'])
    expect(cols[2].lines).toEqual(['Line 5', 'Line 6'])
  })

  it('returns empty array when linesPerPage is 0', () => {
    expect(buildColumns(lines, 2, 0, 1)).toEqual([])
  })

  it('handles pagination correctly', () => {
    const longLines = Array.from({ length: 12 }, (_, i) => `L${i + 1}`)
    const page2 = buildColumns(longLines, 2, 6, 2) // page 2 gets lines 7-12
    expect(page2[0].lines).toEqual(['L7', 'L8', 'L9'])
    expect(page2[1].lines).toEqual(['L10', 'L11', 'L12'])
  })
})

describe('altSet computation', () => {
  it('marks every other non-empty line as alt', () => {
    const lines = ['Line A', 'Line B', 'Line C', 'Line D']
    const cols = buildColumns(lines, 1, 4, 1)
    const altSet = cols[0].altSet

    expect(altSet.has(0)).toBe(false) // 1st non-empty → not alt
    expect(altSet.has(1)).toBe(true)  // 2nd non-empty → alt
    expect(altSet.has(2)).toBe(false) // 3rd → not alt
    expect(altSet.has(3)).toBe(true)  // 4th → alt
  })

  it('skips empty lines in alt counting', () => {
    const lines = ['Line A', '', 'Line B', '', 'Line C']
    const cols = buildColumns(lines, 1, 5, 1)
    const altSet = cols[0].altSet

    expect(altSet.has(0)).toBe(false) // "Line A" → count=0, not alt
    expect(altSet.has(1)).toBe(false) // empty → skipped
    expect(altSet.has(2)).toBe(true)  // "Line B" → count=1, alt
    expect(altSet.has(3)).toBe(false) // empty → skipped
    expect(altSet.has(4)).toBe(false) // "Line C" → count=2, not alt
  })

  it('handles all-empty column', () => {
    const lines = ['', '', '']
    const cols = buildColumns(lines, 1, 3, 1)
    expect(cols[0].altSet.size).toBe(0)
  })

  it('handles single line', () => {
    const cols = buildColumns(['Only line'], 1, 1, 1)
    expect(cols[0].altSet.size).toBe(0) // first line is never alt
  })
})

describe('collapseRepeats', () => {
  it('collapses 3+ consecutive identical lines', () => {
    const result = collapseRepeats(['oh', 'oh', 'oh', 'oh'])
    expect(result).toEqual(['oh (x4)'])
  })

  it('does not collapse 2 consecutive identical lines', () => {
    const result = collapseRepeats(['oh', 'oh', 'yeah'])
    expect(result).toEqual(['oh', 'oh', 'yeah'])
  })

  it('preserves empty lines', () => {
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
})
