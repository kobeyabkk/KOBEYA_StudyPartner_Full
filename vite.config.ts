import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: "src/worker.ts",
      name: "worker", 
      formats: ["es"]
    },
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: "_worker.js",
        format: "es"
      },
      plugins: [
        // export defaultの形式を保持するためのプラグイン
        {
          name: 'preserve-export-default',
          generateBundle(options, bundle) {
            // _worker.jsの内容を修正
            const chunk = bundle['_worker.js'];
            if (chunk && chunk.type === 'chunk') {
              chunk.code = chunk.code.replace(
                /export \{\s*(\w+) as default\s*\};?/,
                'export default $1;'
              );
            }
          }
        }
      ]
    },
    target: "es2022",
    minify: false  // デバッグしやすくするため
  }
});