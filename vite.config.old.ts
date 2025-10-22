// Temporary config for OLD path (without /detective-board base)
// This is to recover data from old IndexedDB
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  base: '/', // NO BASE PATH - to access old IndexedDB data
  plugins: [react()],
  server: {
    middlewareMode: false,
    allowedHosts: ['ibet.team', 'localhost', '145.239.82.124'],
    host: '0.0.0.0',
    port: 5174,
  },
  build: {
    outDir: 'dist-old',
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index-old.html'),
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
