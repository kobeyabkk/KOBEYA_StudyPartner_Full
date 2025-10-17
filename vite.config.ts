import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    ssr: "src/worker.ts",  // Worker エントリポイント
    outDir: "dist",
    rollupOptions: {
      output: { 
        entryFileNames: "_worker.js",  // dist/_worker.js を生成
        format: 'es'
      },
    },
    minify: false,  // デバッグしやすくするため
    sourcemap: false
  },
  // Cloudflare 実行環境で不要なネイティブ依存は外部化
  ssr: { 
    noExternal: true,  // 全ての依存をバンドル
    target: 'webworker'
  }
})