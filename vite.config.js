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
      return import('./server/api.js').then(({ setupAPI, loadEnv }) => {
        loadEnv(__dirname)
        setupAPI(server.middlewares)
      })
    },
  }
}

export default defineConfig({
  plugins: [vue(), chordApiPlugin()],
  server: {
    port: 5555,
  },
})
