import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { resolve } from 'path'

// Client-only build configuration (no Hono SSR)
export default defineConfig({
  publicDir: false, // Don't copy public files (main build does this)
  plugins: [
    react({
      jsxRuntime: 'automatic'
    })
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: false, // Don't delete _worker.js
    rollupOptions: {
      input: {
        client: resolve(__dirname, 'src/client.tsx')
      },
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]'
      }
    }
  }
})
