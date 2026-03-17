import { describe, it, expect } from 'vitest'
import { parseChordHTML } from '../../server/chordParser.js'

describe('parseChordHTML', () => {
  it('returns null for empty/falsy input', () => {
    expect(parseChordHTML('')).toBeNull()
    expect(parseChordHTML(null)).toBeNull()
    expect(parseChordHTML(undefined)).toBeNull()
  })

  it('parses a simple chord chart with sections', () => {
    const html = `
[Intro]
Am   C   G   D

[Verse]
Am   C   G   D
Am   C   G   D

[Chorus]
C   G   Am   F
`
    const result = parseChordHTML(html)
    expect(result).not.toBeNull()
    expect(result.sections.length).toBeGreaterThanOrEqual(2)
    expect(result.structure).toContain('INTRO')
    expect(result.structure).toContain('VERSE')
    expect(result.structure).toContain('CHORUS')
  })

  it('extracts capo number', () => {
    const html = `Capo: 3
[Verse]
G   C   D
`
    const result = parseChordHTML(html)
    expect(result).not.toBeNull()
    expect(result.capo).toBe(3)
  })

  it('handles capo case insensitivity', () => {
    const html = `capo 5
[Intro]
Am C
`
    const result = parseChordHTML(html)
    expect(result).not.toBeNull()
    expect(result.capo).toBe(5)
  })

  it('returns null when no sections found', () => {
    const html = 'Just some random text with no chords or sections'
    expect(parseChordHTML(html)).toBeNull()
  })

  it('maps section names correctly', () => {
    const html = `
[Pre-Chorus]
Am C

[Solo]
Em Am
`
    const result = parseChordHTML(html)
    expect(result).not.toBeNull()
    const sectionNames = result.sections.map(s => s.section)
    expect(sectionNames).toContain('PRE-CHORUS')
    expect(sectionNames).toContain('SOLO')
  })

  it('deduplicates sections with identical chord sets', () => {
    const html = `
[Verse]
Am C G D

[Chorus]
Am C G D
`
    const result = parseChordHTML(html)
    expect(result).not.toBeNull()
    // Same chords → merged into one entry with combined name
    expect(result.sections.length).toBe(1)
    expect(result.sections[0].section).toContain('VERSE')
    expect(result.sections[0].section).toContain('CHORUS')
  })

  it('keeps sections with different chord sets separate', () => {
    const html = `
[Verse]
Am C G D

[Chorus]
F G Am C
`
    const result = parseChordHTML(html)
    expect(result).not.toBeNull()
    expect(result.sections.length).toBe(2)
  })

  it('strips HTML tags from lines', () => {
    const html = `
[Verse]
<span data-name="Am">Am</span>  <span data-name="C">C</span>
`
    const result = parseChordHTML(html)
    expect(result).not.toBeNull()
    expect(result.sections.length).toBeGreaterThanOrEqual(1)
  })

  it('extracts chords from data-name attributes', () => {
    const html = `
[Verse]
<span data-name="G">G</span> <span data-name="Em">Em</span> <span data-name="C">C</span>
`
    const result = parseChordHTML(html)
    expect(result).not.toBeNull()
    expect(result.sections[0].chords).toContain('G')
    expect(result.sections[0].chords).toContain('Em')
    expect(result.sections[0].chords).toContain('C')
  })

  it('filters out tab lines', () => {
    const html = `
[Intro]
e|---0---
B|---1---
G|---0---
Am C G
`
    const result = parseChordHTML(html)
    expect(result).not.toBeNull()
    // Tab lines should be ignored, only Am C G taken
    expect(result.sections[0].chords).toContain('Am')
  })

  it('generates structure string with > separator', () => {
    const html = `
[Intro]
Am C

[Verse]
G D

[Chorus]
F C
`
    const result = parseChordHTML(html)
    expect(result).not.toBeNull()
    expect(result.structure).toBe('INTRO > VERSE > CHORUS')
  })
})
