import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

function chordApiPlugin() {
  return {
    name: 'chord-api',
    configureServer(server) {
      // Dynamic import to avoid pulling Node deps into the client bundle
      return Promise.all([
        import('./server/api.js'),
        import('./server/authMiddleware.js'),
      ]).then(([{ setupAPI }, { authMiddleware, getApiToken }]) => {
        server.middlewares.use(authMiddleware)
        // Token bootstrap endpoint (skips auth)
        server.middlewares.use('/api/auth/token', (req, res, next) => {
          if (req.method !== 'GET') return next()
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ token: getApiToken() }))
        })
        setupAPI(server.middlewares)
      })
    },
  }
}

export default defineConfig({
  plugins: [vue(), chordApiPlugin()],
  server: {
    host: '127.0.0.1',
    port: 5555,
  },
  test: {
    environment: 'happy-dom',
    globals: true,
  },
})
