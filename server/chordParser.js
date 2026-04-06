const SECTION_MAP = {
  'intro': 'INTRO', 'verse': 'VERSE', 'chorus': 'CHORUS', 'bridge': 'BRIDGE',
  'pre-chorus': 'PRE-CHORUS', 'prechorus': 'PRE-CHORUS', 'pre chorus': 'PRE-CHORUS',
  'outro': 'OUTRO', 'solo': 'SOLO', 'guitar solo': 'SOLO',
  'interlude': 'INTERLUDE', 'instrumental': 'INSTRUMENTAL',
  'post-chorus': 'POST-CHORUS', 'postchorus': 'POST-CHORUS', 'post chorus': 'POST-CHORUS',
  'refrain': 'REFRAIN', 'hook': 'HOOK', 'breakdown': 'BREAKDOWN',
  'riff': 'RIFF', 'tag': 'TAG', 'coda': 'CODA', 'ending': 'ENDING',
  'turnaround': 'TURNAROUND', 'transition': 'TRANSITION',
  'break': 'BREAK', 'ad lib': 'AD LIB', 'adlib': 'AD LIB',
  'modulation': 'MODULATION', 'vamp': 'VAMP'
}

const CHORD_RE = /^[A-G][#b]?(m|maj|min|dim|aug|sus\d?|add\d+|7|9|11|13|6)*(\/[A-G][#b]?)?$/

function mapSection(raw) {
  const lower = raw.toLowerCase().replace(/\s*\d+$/, '').replace(/\s*\(.*\)$/, '').trim()
  return SECTION_MAP[lower] || raw.toUpperCase().replace(/\s*\d+$/, '').replace(/\s*\(.*\)$/, '').trim()
}

function isChordToken(tok) {
  return CHORD_RE.test(tok.replace(/[~*|x\d]+$/g, ''))
}

function isChordLine(text) {
  if (!text || text.length < 1) return false
  if (/^\[/.test(text)) return false
  if (/^[A-Ga-g][#b]?\s*[:\-|]/i.test(text)) return false
  if (/tun(ing|e)/i.test(text)) return false
  if (/[-x]\d{4,}/.test(text)) return false
  if (/-{4,}/.test(text)) return false
  if (/^\*/.test(text)) return false
  const tokens = text.split(/\s+/).filter(t => t.length > 0)
  if (tokens.length === 0) return false
  let chordCount = 0
  for (const tok of tokens) {
    const clean = tok.replace(/[(),:\|\-~*]/g, '')
    if (!clean) continue
    if (isChordToken(clean)) chordCount++
  }
  return chordCount > 0 && chordCount >= tokens.length * 0.6
}

function extractChordsFromText(text) {
  const tokens = text.split(/\s+/).filter(t => t.length > 0)
  const chords = []
  for (const tok of tokens) {
    const clean = tok.replace(/[(),:\|\-~*]/g, '')
    if (clean && isChordToken(clean)) chords.push(clean)
  }
  return chords
}

function detectSection(textLine) {
  const bracketMatch = textLine.match(/^\[(.+?)\]$/)
  if (bracketMatch) {
    const bName = bracketMatch[1]
    const bLower = bName.toLowerCase().replace(/\s*\d+$/, '').replace(/\s*\(.*\)$/, '').trim()
    if (SECTION_MAP[bLower]) return { name: bName, remainder: '' }
    /* Also try splitting on slash for names like [RIFF1] */
    if (bLower.indexOf('/') !== -1) {
      const parts = bLower.split('/')
      if (parts.some(p => SECTION_MAP[p.trim()])) return { name: bName, remainder: '' }
    }
    return null
  }

  const stripped = textLine.replace(/^\*+|\*+$/g, '').trim()

  let sectionMatch = stripped.match(/^([a-z][a-z\s\/\-]*\d*)\s*:\s*(.*)/i)
  if (!sectionMatch) {
    sectionMatch = stripped.match(/^([a-z][a-z\s\/\-]*\d*)\s*$/i)
    if (sectionMatch) sectionMatch[2] = ''
  }
  if (!sectionMatch) return null

  const candidate = sectionMatch[1].trim()
  const remainder = sectionMatch[2] ? sectionMatch[2].trim() : ''

  const lookups = [candidate.toLowerCase()]
  lookups.push(candidate.replace(/\s*\d+$/, '').toLowerCase().trim())

  if (candidate.indexOf('/') !== -1) {
    const parts = candidate.split('/')
    for (const part of parts) {
      lookups.push(part.trim().toLowerCase())
    }
  }

  for (const lookup of lookups) {
    if (SECTION_MAP[lookup]) {
      return { name: candidate, remainder }
    }
  }
  return null
}

/**
 * Parse raw pre.innerHTML from a UG chord page.
 * Returns { sections, structure, capo } or null.
 */
export function parseChordHTML(html) {
  if (!html) return null

  let capo = null
  const capoMatch = html.match(/[Cc]apo[:\s]+(\d+)/)
  if (capoMatch) capo = parseInt(capoMatch[1])

  const lines = html.split('\n')
  const allSections = []
  let currentSection = null
  let currentChords = []
  let inChordsUsedBlock = true

  for (const line of lines) {
    const textLine = line.replace(/<[^>]*>/g, '').trim()
    if (!textLine) continue

    const section = detectSection(textLine)
    if (section) {
      inChordsUsedBlock = false
      if (currentSection && currentChords.length > 0) {
        allSections.push({ section: currentSection, chords: currentChords.slice() })
        currentChords = []
      }
      currentSection = mapSection(section.name)

      if (section.remainder) {
        const spanRe = /data-name="([^"]+)"/g
        let m
        const inlineSpanChords = []
        while ((m = spanRe.exec(line)) !== null) {
          if (/^[A-G]/.test(m[1])) inlineSpanChords.push(m[1])
        }
        if (inlineSpanChords.length > 0) {
          currentChords.push(...inlineSpanChords)
        } else if (isChordLine(section.remainder)) {
          currentChords.push(...extractChordsFromText(section.remainder))
        }
      }
      continue
    }

    if (inChordsUsedBlock) continue
    if (/^[\w\s]+([-x]+\d{4,}|[-x]\s*\d{3,})/.test(textLine)) continue
    if (/^[A-Ga-g][#b]?\s*[:\-|]/i.test(textLine)) continue
    if (/-{4,}/.test(textLine)) continue

    const spanChords = []
    const spanRe2 = /data-name="([^"]+)"/g
    let m2
    while ((m2 = spanRe2.exec(line)) !== null) {
      if (m2[1] && /^[A-G]/.test(m2[1])) spanChords.push(m2[1])
    }

    if (spanChords.length > 0) {
      currentChords.push(...spanChords)
    } else if (isChordLine(textLine)) {
      currentChords.push(...extractChordsFromText(textLine))
    }
  }

  if (currentSection && currentChords.length > 0) {
    allSections.push({ section: currentSection, chords: currentChords.slice() })
  }

  if (allSections.length === 0) return null

  const structure = allSections.map(s => s.section).join(' > ')

  /* Dedup: collapse sections with identical chord sets, combine labels with slash */
  const merged = []
  const seen = {}
  for (const s of allSections) {
    const unique = []
    const chordSeen = {}
    for (const c of s.chords) {
      if (!chordSeen[c]) { chordSeen[c] = true; unique.push(c) }
    }
    const key = unique.join(' \u00B7 ')
    if (!seen[key]) {
      const entry = { section: s.section, chords: key, _names: [s.section] }
      seen[key] = entry
      merged.push(entry)
    } else {
      if (!seen[key]._names.includes(s.section)) {
        seen[key]._names.push(s.section)
        seen[key].section = seen[key]._names.join('/')
      }
    }
  }

  /* Clean up internal _names field */
  const result = merged.map(({ section, chords }) => ({ section, chords }))

  return { sections: result, structure, capo }
}
