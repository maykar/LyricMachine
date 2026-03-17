import { describe, it, expect } from 'vitest'
import { splitTitle } from '../../src/utils/titleParser.js'

describe('splitTitle', () => {
  it('splits "Artist — Track" correctly', () => {
    const result = splitTitle('Nirvana — Smells Like Teen Spirit')
    expect(result).toEqual({ artist: 'Nirvana', track: 'Smells Like Teen Spirit' })
  })

  it('returns empty artist when no separator', () => {
    const result = splitTitle('Just A Track Name')
    expect(result).toEqual({ artist: '', track: 'Just A Track Name' })
  })

  it('handles empty string', () => {
    const result = splitTitle('')
    expect(result).toEqual({ artist: '', track: '' })
  })

  it('uses first separator when multiple present', () => {
    const result = splitTitle('Artist — Track — Remix')
    expect(result).toEqual({ artist: 'Artist', track: 'Track — Remix' })
  })

  it('handles separator at start', () => {
    const result = splitTitle(' — Track')
    expect(result).toEqual({ artist: '', track: 'Track' })
  })

  it('does not split on regular hyphen', () => {
    const result = splitTitle('Blink-182 - Dammit')
    expect(result).toEqual({ artist: '', track: 'Blink-182 - Dammit' })
  })

  it('does not split on en-dash without spaces', () => {
    const result = splitTitle('Artist\u2013Track')
    expect(result).toEqual({ artist: '', track: 'Artist\u2013Track' })
  })
})
