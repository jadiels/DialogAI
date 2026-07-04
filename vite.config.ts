/// <reference types="vitest/config" />
import { copyFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Copy the built index.html to 404.html so GitHub Pages serves the SPA
// for deep links / hard refreshes instead of returning a 404.
function spaFallback(): Plugin {
  return {
    name: 'spa-404-fallback',
    apply: 'build',
    closeBundle() {
      const out = resolve(__dirname, 'dist')
      copyFileSync(resolve(out, 'index.html'), resolve(out, '404.html'))
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  // Served from https://jadiels.github.io/DialogAI/ in production,
  // from / during local dev.
  base: command === 'build' ? '/DialogAI/' : '/',
  plugins: [react(), tailwindcss(), spaFallback()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
}))
