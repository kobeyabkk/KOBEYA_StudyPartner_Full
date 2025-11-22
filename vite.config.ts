import build from '@hono/vite-build/cloudflare-pages'
import devServer from '@hono/vite-dev-server'
import adapter from '@hono/vite-dev-server/cloudflare'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  publicDir: "public",
  plugins: [
<<<<<<< HEAD
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
=======
    // React プラグインを最初に配置（重要）
    react({
      // クライアントサイドのみに適用
      include: ['**/src/client.tsx', '**/src/pages/**/*.tsx', '**/src/components/**/*.tsx', '**/src/hooks/**/*.ts'],
      jsxRuntime: 'automatic'
    }),
    // Hono ビルドプラグイン（サーバーサイドのみ）
>>>>>>> origin/genspark_ai_developer
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
<<<<<<< HEAD
      entry: 'src/index.tsx'
    }),
=======
      entry: 'src/index.tsx',
      // クライアントサイドファイルを除外
      exclude: [
        '**/src/client.tsx',
        '**/src/pages/**',
        '**/src/components/**',
        '**/src/hooks/**'
      ]
    })
>>>>>>> origin/genspark_ai_developer
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
    port: 5173,
    // サンドボックスホストからのアクセスを許可
    allowedHosts: [
      '.sandbox.novita.ai',
      'localhost'
    ]
  },
  build: {
    outDir: 'dist'
  }
})
