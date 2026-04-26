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

function mapSection(raw) {
  const clean = raw.replace(/\s+(?:[IVX]+|\d+)$/i, '').replace(/\s*\(.*\)$/, '').trim()
  const lower = clean.toLowerCase()
  return SECTION_MAP[lower] || clean.toUpperCase()
}

function detectSection(textLine) {
  const bracketMatch = textLine.match(/^\[([^\]]+)\]$/)
  if (bracketMatch) {
    const bName = bracketMatch[1]
    const bLower = bName.toLowerCase().replace(/\s*\d+$/, '').replace(/\s*\(.*\)$/, '').trim()
    if (SECTION_MAP[bLower]) return { name: bName, remainder: '' }
    if (bLower.indexOf('/') !== -1) {
      const parts = bLower.split('/')
      if (parts.some(p => SECTION_MAP[p.trim()])) return { name: bName, remainder: '' }
    }
    return { name: bName, remainder: '' } // Fallback for raw bracket names like [Solo 1]
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

  const lookups = [candidate.toLowerCase(), candidate.replace(/\s*\d+$/, '').toLowerCase().trim()]
  if (candidate.indexOf('/') !== -1) {
    candidate.split('/').forEach(part => lookups.push(part.trim().toLowerCase()))
  }

  for (const lookup of lookups) {
    if (SECTION_MAP[lookup]) {
      return { name: candidate, remainder }
    }
  }
  return null
}
/**
 * Parse raw text payload from UG mobile API (contains [ch] and [tab] brackets).
 * Returns { sections, structure, capo } or null.
 */
export function parseUGText(text) {
  if (!text) return null

  let capo = null
  const capoMatch = text.match(/[Cc]apo[:\s]+(\d+)/)
  if (capoMatch) capo = parseInt(capoMatch[1])

  const lines = text.split('\n')
  const allSections = []
  let currentSection = null
  let currentChords = []
  let inChordsUsedBlock = false

  for (let line of lines) {
    line = line.trim()
    if (!line) continue

    // Remove [tab] tags but keep their contents
    line = line.replace(/\[\/?tab\]/g, '')

    // Clean up text versions of chords line like "[ch]G[/ch]   [ch]C[/ch]"
    const section = detectSection(line)
    if (section) { // Only detect real section headers, not lyrics lines that happen to look like headers
      inChordsUsedBlock = false
      if (currentSection && currentChords.length > 0) {
        allSections.push({ section: currentSection, chords: currentChords.slice() })
        currentChords = []
      }
      currentSection = mapSection(section.name)
      
      // Extract chords trailing a section header like "Verse: [ch]G[/ch] [ch]D[/ch]"
      if (section.remainder) {
        const m = section.remainder.match(/\[ch\](.*?)\[\/ch\]/g)
        if (m) {
          currentChords.push(...m.map(c => c.replace(/\[\/?ch\]/g, '')))
        }
      }
      continue
    }

    if (inChordsUsedBlock) continue

    // Extract [ch] tags from the line
    const chordMatches = line.match(/\[ch\](.*?)\[\/ch\]/g)
    if (chordMatches) {
      if (!currentSection) currentSection = 'INTRO'
      currentChords.push(...chordMatches.map(c => c.replace(/\[\/?ch\]/g, '')))
    }
  }

  if (currentSection && currentChords.length > 0) {
    allSections.push({ section: currentSection, chords: currentChords.slice() })
  }

  if (allSections.length === 0) return null

  const structure = allSections.map(s => s.section).join(' > ')

  /* Dedup: collapse sections with identical chord sets, combine labels */
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

  const result = merged.map(({ section, chords }) => ({ section, chords }))
  return { sections: result, structure, capo }
}
