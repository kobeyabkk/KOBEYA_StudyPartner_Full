import build from '@hono/vite-build/cloudflare-pages'
import devServer from '@hono/vite-dev-server'
import adapter from '@hono/vite-dev-server/cloudflare'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  publicDir: "public",
  plugins: [
    // React プラグインを最初に配置（重要）
    react({
      // クライアントサイドのみに適用
      include: ['**/src/client.tsx', '**/src/pages/**/*.tsx', '**/src/components/**/*.tsx', '**/src/hooks/**/*.ts'],
      jsxRuntime: 'automatic'
    }),
    // Hono ビルドプラグイン（サーバーサイドのみ）
    build({
      minify: false,
      entry: 'src/index.tsx',
      // クライアントサイドファイルを除外
      exclude: [
        '**/src/client.tsx',
        '**/src/pages/**',
        '**/src/components/**',
        '**/src/hooks/**'
      ]
    }),
    devServer({
      adapter,
      entry: 'src/index.tsx',
      // クライアントサイドファイルを除外
      exclude: [
        '**/src/client.tsx',
        '**/src/pages/**',
        '**/src/components/**',
        '**/src/hooks/**'
      ]
    })
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
    // サンドボックスホストからのアクセスを許可
    allowedHosts: [
      '.sandbox.novita.ai',
      'localhost'
    ]
  },
  build: {
    outDir: 'dist'
  },
  // 最適化設定
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom']
  }
})
