import { defineConfig } from "vite";

export default defineConfig({
  build: {
    ssr: true,               // SSRモード（=バンドラはwebworkerターゲット）
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: "src/worker.ts",
      output: {
        entryFileNames: "_worker.js",
        format: "es"
      }
    },
    target: "es2022"
  }
});