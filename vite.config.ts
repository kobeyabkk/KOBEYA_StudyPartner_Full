import { defineConfig } from "vite";

export default defineConfig({
  build: {
    ssr: "src/worker.ts",     // ← このファイルをWorkerとしてビルド
    outDir: "dist",
    target: "es2022",
    rollupOptions: {
      input: "src/worker.ts",
      output: {
        entryFileNames: "_worker.js", // ← dist/_worker.js を強制
      },
    },
  },
});
