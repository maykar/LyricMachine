import { readFileSync } from 'fs'
import { join } from 'path'
import { parseChordHTML } from './chordParser.js'
import { parseBody } from './api.js'

let pendingImport = null

export function setupUGImportRoutes(server) {
  /* POST /api/import-raw — bookmarklet sends raw pre.innerHTML, server parses */
  server.use('/api/import-raw', async (req, res, next) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      })
      res.end()
      return
    }
    if (req.method !== 'POST') return next()

    try {
      const { html } = await parseBody(req)
      const result = parseChordHTML(html)
      if (!result || result.sections.length === 0) {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
        res.end(JSON.stringify({ ok: false, error: 'No chords found' }))
        return
      }
      pendingImport = { ...result, timestamp: Date.now() }
      console.log(`UG import parsed: ${result.sections.length} sections | ${result.structure}`)
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
      res.end(JSON.stringify({ ok: true, sections: result.sections.length }))
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
      res.end(JSON.stringify({ error: e.message }))
    }
  })

  /* GET /api/import-chords — app polls for pending import */
  server.use('/api/import-chords', (req, res, next) => {
    if (req.method !== 'GET') return next()
    const data = pendingImport
    pendingImport = null
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(data || { empty: true }))
  })
}

export function setupBookmarkletRoutes(server, serverDir) {
  const bookmarkletPath = join(serverDir, 'bookmarklet.js')
  // Cache bookmarklet code at startup
  const bookmarkletCode = readFileSync(bookmarkletPath, 'utf-8')

  server.use('/api/bookmarklet.js', (req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/javascript' })
    res.end(bookmarkletCode)
  })

  server.use('/api/bookmarklet', (req, res) => {
    const minified = bookmarkletCode.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').trim()
    const href = 'javascript:' + encodeURIComponent(minified)
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(`<!DOCTYPE html>
<html><head><title>UG Import Bookmarklet Setup</title>
<style>
  body { font-family: system-ui; max-width: 600px; margin: 40px auto; padding: 20px; background: #1a1a2e; color: #e0e0e0; }
  h1 { color: #64ffda; }
  a.bookmarklet { display: inline-block; padding: 12px 24px; background: #64ffda; color: #1a1a2e; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 18px; cursor: grab; }
  a.bookmarklet:hover { background: #4fd1c5; }
  .steps { line-height: 2; }
  .steps li { margin: 8px 0; }
  code { background: #2d2d44; padding: 2px 6px; border-radius: 4px; }
</style></head>
<body>
  <h1>🎸 UG Import Bookmarklet</h1>
  <p>Drag this button to your <strong>bookmarks bar</strong>:</p>
  <p><a class="bookmarklet" href="${href}">⚡ UG Import</a></p>
  <h2>How to Use</h2>
  <ol class="steps">
    <li>Press <code>T</code> in LyricMachine to open Ultimate Guitar search</li>
    <li>Click the <strong>⚡ UG Import</strong> bookmark</li>
    <li>It auto-finds the first Chords result, extracts data, and sends it to your app</li>
    <li>Switch back to LyricMachine — chords are updated!</li>
  </ol>
  <h2>Test</h2>
  <p>Current pending import: <span id="status">checking...</span></p>
  <script>
    fetch('/api/import-chords').then(r=>r.json()).then(d=>{
      document.getElementById('status').textContent = d.empty ? 'None' : JSON.stringify(d.sections);
    });
  </script>
</body></html>`)
  })
}
