import crypto from 'crypto'
import { parseUGText } from './ugNativeParser.js'

/**
 * Generates a random 16-character hex string imitating a mobile device ID
 */
function generateDeviceId() {
  return crypto.randomBytes(8).toString('hex')
}

/**
 * Generates the UG API authentication hash
 * MD5(device_id + UTC_YYYY-MM-DD:HH + "createLog()")
 */
export function generateApiKey(deviceId, dateOverride = null) {
  const d = dateOverride || new Date()
  const utcDate = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
  const hour = d.getUTCHours()
  const formattedDate = `${utcDate}:${hour}`

  const payload = `${deviceId}${formattedDate}createLog()`
  return crypto.createHash('md5').update(payload).digest('hex')
}

/**
 * Constructs standard headers required for the UG Mobile API
 */
function getHeaders() {
  const deviceId = generateDeviceId()
  const apiKey = generateApiKey(deviceId)

  return {
    'Accept': 'application/json',
    'User-Agent': 'UGT_ANDROID/4.11.1 (Pixel; 8.1.0)',
    'X-UG-CLIENT-ID': deviceId,
    'X-UG-API-KEY': apiKey
  }
}

/**
 * Search the UG Mobile API for a song, filtering to "Chords" and sorting by highest votes.
 * 
 * @param {string} query The song title/artist search term
 * @returns {Array} Array of tab result objects
 */
export async function searchTabs(query) {
  const url = new URL('https://api.ultimate-guitar.com/api/v1/tab/search')
  url.searchParams.set('title', query)
  url.searchParams.set('type[]', 'Chords') // Only chord types
  
  const response = await fetch(url.toString(), {
    headers: getHeaders()
  })

  if (!response.ok) {
    throw new Error(`UG Search failed: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()
  let tabs = data.tabs || []

  // Ensure strict filtering just in case UG ignores the type param
  tabs = tabs.filter(tab => tab.type === 'Chords' || tab.typeLabel === 'Chords')

  // Sort based on custom logic:
  // 1. If rating >= 4.5, sort by most votes (treating anything 4.5+ as "excellent" and letting popularity win)
  // 2. Otherwise, sort by highest rating
  tabs.sort((a, b) => {
    const aRating = a.rating || 0
    const bRating = b.rating || 0
    const aVotes = a.votes || 0
    const bVotes = b.votes || 0

    const aIsExcellent = aRating >= 4.5
    const bIsExcellent = bRating >= 4.5

    if (aIsExcellent && bIsExcellent) {
      // Both meet the threshold -> most votes wins
      if (bVotes !== aVotes) return bVotes - aVotes
      return bRating - aRating
    }

    if (aIsExcellent && !bIsExcellent) return -1 // a wins
    if (!aIsExcellent && bIsExcellent) return 1  // b wins

    // Neither meets the 4.5 threshold -> highest rated wins
    if (bRating !== aRating) return bRating - aRating
    
    // Ultimate fallback
    return bVotes - aVotes
  })

  return tabs
}

/**
 * Fetch raw chord content from the UG Mobile API by tab ID
 * 
 * @param {number} tabId Ultimate Guitar Tab ID
 * @returns {string} Raw text payload containing [ch] and [tab] tags
 */
export async function getTab(tabId) {
  const url = `https://api.ultimate-guitar.com/api/v1/tab/info?tab_id=${tabId}&tab_access_type=private`
  
  const response = await fetch(url, {
    headers: getHeaders()
  })

  if (!response.ok) {
    throw new Error(`UG Tab Fetch failed: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()
  
  // The tab object is returned directly at the root, not nested under "tab"
  if (!data || !data.content) {
    throw new Error('UG API did not return valid tab content')
  }

  // Return the entire tab JSON so we can access content, tuning, tonality_name, etc.
  return data
}

/**
 * Express routing layer for the UG Native Backend
 */
export function setupUGNativeRoutes(server, routes) {
  const { get, json } = routes
  get(server, '/api/ug/search', async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost')
      const q = url.searchParams.get('q')
      if (!q) return json(res, { error: 'Query parameter q is required' }, 400)
      
      const results = await searchTabs(q)
      json(res, results)
    } catch (err) {
      json(res, { error: err.message }, 500)
    }
  })

  get(server, '/api/ug/chords', async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost')
      const idStr = url.searchParams.get('id')
      if (!idStr) return json(res, { error: 'Tab ID is required' }, 400)
      
      const id = parseInt(idStr, 10)
      if (isNaN(id)) return json(res, { error: 'Invalid Tab ID' }, 400)

      const tabData = await getTab(id)
      const rawText = tabData.content || ''
      const parsed = parseUGText(rawText)
      
      if (!parsed) {
        return json(res, { error: 'Could not parse chords from this tab' }, 422)
      }

      // Format tuning object into a readable string (e.g., "D A D G B E")
      let tuningStr = null
      if (tabData.tuning) {
        if (typeof tabData.tuning === 'string') tuningStr = tabData.tuning
        else if (tabData.tuning.value) tuningStr = tabData.tuning.value
        else if (tabData.tuning.name) tuningStr = tabData.tuning.name
      }

      parsed.tonalityName = tabData.tonality_name || null
      parsed.tuning = tuningStr

      json(res, { rawText, parsed })
    } catch (err) {
      json(res, { error: err.message }, 500)
    }
  })
}
