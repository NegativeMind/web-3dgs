import { defineConfig, type Plugin } from "vite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const widgetFilePath = fileURLToPath(new URL("dist/3dgs-viewer.js", import.meta.url));
const CDN_WIDGET_URL =
  "https://cdn.jsdelivr.net/gh/NegativeMind/web-3dgs@main/dist/3dgs-viewer.js";

const serveLocalWidgetPlugin: Plugin = {
  name: "serve-local-widget",
  configureServer(server) {
    server.middlewares.use("/dist/3dgs-viewer.js", (_req, res, next) => {
      try {
        const content = readFileSync(widgetFilePath);
        res.setHeader("Content-Type", "application/javascript");
        res.end(content);
      } catch {
        next();
      }
    });
  },
  transformIndexHtml: {
    order: "pre",
    handler(html, ctx) {
      if (ctx.server) {
        return html.replace(CDN_WIDGET_URL, "/dist/3dgs-viewer.js");
      }
      return html;
    },
  },
};

export default defineConfig({
  root: "src",
  base: "./",
  publicDir: "../public",
  plugins: [serveLocalWidgetPlugin],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    chunkSizeWarningLimit: 6000,
  },
  server: {
    port: 5173,
    open: true,
  },
  optimizeDeps: {
    exclude: ["@sparkjsdev/spark"],
  },
});
