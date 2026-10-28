import { copyFile } from 'node:fs/promises'
import { join } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// vercel.json rewrites only the app's real routes to index.html. Any other
// URL gets Vercel's 404.html with a real 404 status, so that file is the app
// too: it boots, and the router shows NotFound.
function notFoundPage() {
  return {
    name: 'not-found-page',
    apply: 'build',
    async writeBundle({ dir }) {
      await copyFile(join(dir, 'index.html'), join(dir, '404.html'))
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), notFoundPage()],
})
