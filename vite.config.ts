import build from '@hono/vite-build/cloudflare-pages'
import devServer from '@hono/vite-dev-server'
import adapter from '@hono/vite-dev-server/cloudflare'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  publicDir: "public",
  plugins: [
    // Reactプラグインを最初に配置（クライアントサイドのReactファイルに適用）
    react({
      // JSX ランタイムの設定（自動的にReactのJSXランタイムを使用）
      jsxRuntime: 'automatic',
      // クライアントサイドのReactファイルのみに適用
      include: [
        /src\/client\.tsx$/,
        /src\/pages\/.*\.tsx$/,
        /src\/components\/.*\.tsx$/,
        /src\/hooks\/.*\.tsx?$/,
      ],
      // Honoのサーバーサイドファイルは除外
      exclude: [
        /src\/index\.tsx$/,
        /src\/renderer\.tsx$/,
        /src\/worker\.ts$/,
        /src\/eiken\/.*\.tsx?$/,
      ],
    }),
    // Honoのビルドプラグイン（サーバーサイド用・APIルート用）
    build({
      minify: false,
      entry: 'src/index.tsx'
    }),
    devServer({
      adapter,
      entry: 'src/index.tsx'
    }),
  ],
  resolve: {
    alias: {
      // ReactのJSXランタイムを強制
      'react/jsx-runtime': 'react/jsx-runtime',
      'react/jsx-dev-runtime': 'react/jsx-dev-runtime',
    },
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom'],
    exclude: ['hono'],
  },
  server: {
    host: '0.0.0.0',
    port: 5173
  },
  build: {
    outDir: 'dist'
  }
})
