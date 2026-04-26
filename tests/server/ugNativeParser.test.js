import { describe, it, expect } from 'vitest'
import { parseUGText } from '../../server/ugNativeParser.js'

describe('parseUGText', () => {
  it('detects a capo instruction', () => {
    const raw = 'Capo: 2\n\n[Verse]\n[ch]G[/ch]'
    const res = parseUGText(raw)
    expect(res.capo).toBe(2)
  })

  it('maps sections and extracts chords', () => {
    const raw = `
[Verse 1]
[tab]     [ch]Bm[/ch]                               [ch]F#7[/ch]
On a dark desert highway, cool wind in my hair[/tab]

[Chorus]
Welcome to the Hotel California
Such a lovely [ch]G[/ch] place, lovely [ch]D[/ch] face
    `
    const res = parseUGText(raw)
    expect(res.sections).toEqual([
      { section: 'VERSE', chords: 'Bm \u00B7 F#7' },
      { section: 'CHORUS', chords: 'G \u00B7 D' }
    ])
    expect(res.structure).toBe('VERSE > CHORUS')
  })

  it('handles inline chords next to section headers', () => {
    const raw = `Verse: [ch]C[/ch] [ch]G[/ch] [ch]Am[/ch]\n[ch]F[/ch] is great`
    const res = parseUGText(raw)
    expect(res.sections).toEqual([
      { section: 'VERSE', chords: 'C \u00B7 G \u00B7 Am \u00B7 F' }
    ])
  })
})
