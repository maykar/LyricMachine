/**
 * Parse an "Artist — Track" title string into its parts.
 * @param {string} title
 * @returns {{ artist: string, track: string }}
 */
export function splitTitle(title) {
  const sep = title.indexOf(' — ')
  if (sep >= 0) return { artist: title.slice(0, sep), track: title.slice(sep + 3) }
  return { artist: '', track: title }
}
