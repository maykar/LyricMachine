/**
 * LyricMachine Chord Import — Content Script
 *
 * Injected on all ultimate-guitar.com pages.
 * On icon click:
 *   - Search page → navigate to highest-rated "Chords" version
 *   - Chord page  → extract <pre> innerHTML, POST to LyricMachine
 *
 * API_BASE is replaced at serve time by the LyricMachine server.
 * If loading from static files, change this manually.
 */

const API_BASE = 'https://127.0.0.1:5555'

// ─── Message listener ────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'import') handleImport()
})

// ─── Entry point ─────────────────────────────────────────────────────────────
function handleImport() {
  const url = window.location.href
  if (url.includes('/tab/')) {
    extractAndSend()
  } else {
    navigateToBestChords()
  }
}

// ─── SEARCH PAGE: find highest-rated chord version ───────────────────────────

function navigateToBestChords() {
  const url = findBestChordUrl()
  if (url) {
    notify('Opening highest-rated chords…')
    window.location.href = url
  } else {
    notify('No chord results found on this page.', 'error')
  }
}

/**
 * Strategy 1: Parse UG's embedded JSON data.
 *
 * UG renders its React app with hydration data in a hidden
 * <div class="js-store" data-content="..."> element.
 * The JSON contains structured search results with type, rating, and URL.
 * This is far more reliable than scraping the rendered DOM.
 */
function tryJsonData() {
  try {
    const el = document.querySelector('.js-store[data-content]')
    if (!el) return null

    const data = JSON.parse(el.dataset.content)
    const results = data?.store?.page?.data?.results
    if (!Array.isArray(results)) return null

    const chords = results
      .filter(r => /chords/i.test(r.type || r.type_name || ''))
      .sort((a, b) => (b.rating || 0) - (a.rating || 0))

    if (chords.length) {
      console.log(`[LM Import] Found ${chords.length} chord versions via JSON. Best: ${chords[0].rating} ★`)
      return chords[0].tab_url
    }
  } catch (e) {
    console.log('[LM Import] JSON strategy failed:', e.message)
  }
  return null
}

/**
 * Strategy 2: DOM-based fallback.
 *
 * Scan for <a> tags whose href contains "-chords-".
 * For each, walk up to a container and try to extract a rating number.
 * Pick the highest-rated link found.
 */
function tryDomScan() {
  const links = [...document.querySelectorAll('a[href*="/tab/"]')]
    .filter(a => a.href.includes('-chords-'))

  if (links.length === 0) return null

  const scored = links.map(link => {
    // Walk up to find a row-level container that holds this result
    let container = link
    for (let i = 0; i < 8 && container.parentElement; i++) {
      container = container.parentElement
    }

    // Look for a decimal rating like "4.8" in the container text
    let rating = 0
    if (container) {
      const match = container.textContent.match(/\b([1-5]\.\d)\b/)
      if (match) rating = parseFloat(match[1])
    }

    return { href: link.href, rating }
  })

  // Highest rating first; ties broken by DOM order (first = UG's default sort)
  scored.sort((a, b) => b.rating - a.rating)
  console.log(`[LM Import] DOM fallback found ${scored.length} chord links. Best rating: ${scored[0].rating}`)
  return scored[0].href
}

function findBestChordUrl() {
  return tryJsonData() || tryDomScan()
}

// ─── CHORD PAGE: extract and send to LyricMachine ───────────────────────────

async function extractAndSend() {
  const pre = document.querySelector('pre')
  if (!pre) {
    notify('No chord content found on this page.', 'error')
    return
  }

  notify('Importing chords…')

  try {
    const res = await fetch(`${API_BASE}/api/import-raw`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html: pre.innerHTML })
    })

    const data = await res.json()
    if (data.ok) {
      notify(`✓ Imported ${data.sections} chord sections!`, 'success')
      setTimeout(() => window.close(), 1500)
    } else {
      notify(data.error || 'No chords found in content.', 'error')
    }
  } catch {
    notify('Cannot connect to LyricMachine. Is it running?', 'error')
  }
}

// ─── In-page notification ────────────────────────────────────────────────────

function notify(text, type = 'info') {
  const existing = document.getElementById('lm-notify')
  if (existing) existing.remove()

  const el = document.createElement('div')
  el.id = 'lm-notify'
  el.textContent = text

  const bg = type === 'error' ? '#e74c3c' : type === 'success' ? '#2ecc71' : '#f5c542'
  const fg = type === 'info' ? '#1a1a1a' : '#fff'

  el.style.cssText = [
    'position:fixed', 'top:20px', 'right:20px', 'z-index:2147483647',
    'padding:14px 24px', 'border-radius:10px',
    'font:600 15px/1.3 system-ui,sans-serif',
    `color:${fg}`, `background:${bg}`,
    'box-shadow:0 6px 24px rgba(0,0,0,0.4)',
    'transition:opacity 0.3s',
  ].join(';')

  document.body.appendChild(el)

  if (type !== 'error') {
    setTimeout(() => {
      el.style.opacity = '0'
      setTimeout(() => el.remove(), 300)
    }, 3000)
  }
}
