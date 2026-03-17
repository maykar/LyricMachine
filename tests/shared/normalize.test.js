import { describe, it, expect } from 'vitest'
import { normalize } from '../../shared/normalize.js'

describe('normalize', () => {
  it('lowercases text', () => {
    expect(normalize('HELLO WORLD')).toBe('hello world')
  })

  it('strips curly quotes to apostrophes then removes them', () => {
    expect(normalize('Don\u2019t Stop')).toBe('dont stop')
    expect(normalize('It\u2018s')).toBe('its')
    expect(normalize('\u201CHello\u201D')).toBe('hello')
  })

  it('normalizes dashes to hyphens then removes them', () => {
    expect(normalize('Rock \u2014 Roll')).toBe('rock roll')
    expect(normalize('Rock \u2013 Roll')).toBe('rock roll')
  })

  it('strips non-alphanumeric characters', () => {
    expect(normalize('Hello, World!')).toBe('hello world')
    expect(normalize('Song (feat. Artist)')).toBe('song feat artist')
    expect(normalize('A/B Test')).toBe('ab test')
  })

  it('collapses whitespace', () => {
    expect(normalize('  too   many    spaces  ')).toBe('too many spaces')
    expect(normalize('tab\there')).toBe('tab here')
  })

  it('handles empty string', () => {
    expect(normalize('')).toBe('')
  })

  it('handles strings with only symbols', () => {
    expect(normalize('!!!???...')).toBe('')
  })

  it('preserves numbers', () => {
    expect(normalize('Song 123')).toBe('song 123')
  })

  it('handles unicode letters outside a-z (strips them)', () => {
    expect(normalize('Caf\u00E9')).toBe('caf')
    expect(normalize('Na\u00EFve')).toBe('nave')
  })

  it('produces identical output for equivalent variations', () => {
    const a = normalize('Don\u2019t Stop Me Now')
    const b = normalize("don't stop me now")
    const c = normalize('DONT STOP ME NOW')
    expect(a).toBe(b)
    expect(b).toBe(c)
  })
})
