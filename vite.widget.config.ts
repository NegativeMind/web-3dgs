import { defineConfig } from "vite";

export default defineConfig({
  publicDir: false,
  build: {
    lib: {
      entry: "src/widget/index.ts",
      name: "ThreeDgsWidget",
      fileName: () => "3dgs-viewer.js",
      formats: ["iife"],
    },
    outDir: "dist",
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
