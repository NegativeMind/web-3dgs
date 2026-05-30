import { defineConfig, type Plugin } from "vite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const widgetFilePath = fileURLToPath(new URL("dist/3dgs-viewer.js", import.meta.url));
const CDN_WIDGET_URL =
  "https://cdn.jsdelivr.net/gh/NegativeMind/web-3dgs@main/dist/3dgs-viewer.js";

const serveLocalWidgetPlugin: Plugin = {
  name: "serve-local-widget",
  configureServer(server) {
    // test-build.html 用: npm run build:widget で生成済みの dist/3dgs-viewer.js を配信
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
        // dev サーバーではウィジェットソースを直接ロード（ビルド不要・HMR 有効）
        return html.replace(
          `<script src="${CDN_WIDGET_URL}"></script>`,
          `<script type="module" src="/src/index.ts"></script>`
        );
      }
      return html;
    },
  },
};

export default defineConfig(({ command }) => ({
  // dev: プロジェクトルートをサーブ（ナビページ + 全ページにアクセス可）
  // build: embed-generator/ をルートにして dist/index.html へ出力
  root: command === "serve" ? "." : "embed-generator",
  base: "./",
  publicDir: command === "serve" ? "public" : "../public",
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
}));
