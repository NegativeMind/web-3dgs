import { defineConfig } from "vite";

export default defineConfig({
  publicDir: false,
  build: {
    lib: {
      entry: "src/widget/index.ts",
      name: "ThreeDgsWidget",
      fileName: () => "widget.js",
      formats: ["iife"],
    },
    outDir: "cdn",
    emptyOutDir: true,
    chunkSizeWarningLimit: 10000,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
  optimizeDeps: {
    exclude: ["@sparkjsdev/spark"],
  },
});
