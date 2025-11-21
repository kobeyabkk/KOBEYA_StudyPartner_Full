import build from '@hono/vite-build/cloudflare-pages'
import devServer from '@hono/vite-dev-server'
import adapter from '@hono/vite-dev-server/cloudflare'
import { defineConfig } from 'vite'

export default defineConfig({
  publicDir: "public", // public ディレクトリを静的アセットとして使用
  plugins: [
    build({
      minify: false, // 開発時はminifyを無効化
      entry: 'src/index.tsx' // 本番ビルドのエントリーポイントを明示
    }),
    devServer({
      adapter,
      entry: 'src/index.tsx'
    })
  ],
  server: {
    host: '0.0.0.0',
    port: 5173
  },
  build: {
    outDir: 'dist'
  }
})
