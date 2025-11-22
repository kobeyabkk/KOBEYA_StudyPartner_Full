import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// React クライアントアプリ専用のVite設定（Honoなし）
export default defineConfig({
  plugins: [
    react({
      jsxRuntime: 'automatic'
    })
  ],
  resolve: {
    alias: {
      'react/jsx-runtime': 'react/jsx-runtime',
      'react/jsx-dev-runtime': 'react/jsx-dev-runtime',
    },
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom'],
  },
  server: {
    host: '0.0.0.0',
    port: 5174,
    allowedHosts: [
      '.sandbox.novita.ai',
      'localhost'
    ],
    // Honoサーバー（8787）へのAPIプロキシ
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      }
    }
  }
})
