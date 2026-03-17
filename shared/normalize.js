/**
 * Normalize a song title for comparison.
 * Strips curly quotes, dashes, non-alphanum, and collapses whitespace.
 *
 * SINGLE SOURCE OF TRUTH — imported by both server and client.
 */
export function normalize(s) {
  return s.toLowerCase()
    .replace(/[\u2018\u2019\u201C\u201D`\u00B4\u2032\u2033']/g, "'")
    .replace(/[\u2014\u2013\u2012\u2015]/g, '-')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
