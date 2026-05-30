# [Web 3D Gaussian Splatting Viewer Widget (Beta)](https://negativemind.github.io/web-3dgs/)

[![Version](https://img.shields.io/badge/version-0.0.0--beta-blue)](https://github.com/NegativeMind/web-3dgs/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6.3-646cff?logo=vite&logoColor=white)](https://vite.dev/)
[![Three.js](https://img.shields.io/badge/Three.js-0.180-black?logo=threedotjs&logoColor=white)](https://threejs.org/)
[![Spark](https://img.shields.io/badge/Spark-2.0-ff6b35)](https://sparkjs.dev/)
[![GitHub Pages](https://github.com/NegativeMind/web-3dgs/actions/workflows/deploy.yml/badge.svg)](https://github.com/NegativeMind/web-3dgs/actions/workflows/deploy.yml)

> ⚠️ まだバージョン1未満のベータ版です。仕様が予告なく変更される可能性があります。

`.sog` / `.ply` / `.splat` 形式の 3D Gaussian Splatting ファイルを任意の Web ページに埋め込めるウィジェットスクリプトです。
OrbitControls によるオブジェクト閲覧モードと、FPS スタイルで空間を歩き回るイマーシブモードの 2 種類に対応しています。
WebXR にも対応しており、Meta Quest などの VR/MR デバイスで没入体験が可能です。

[埋め込みコード作成ツール](https://negativemind.github.io/web-3dgs/)を用意しています。

## 使い方

### 1. 埋め込みコードを生成する

[ジェネレーターページ](https://negativemind.github.io/web-3dgs/)で 3DGS ファイルの URL を入力すると、埋め込みコードを自動生成できます。

### 2. コード埋め込み

生成されたコード、または以下のコードの `src` 属性を使用したい 3DGS ファイルの URL に書き換えて貼り付けてください。

```html
<threedgs-viewer
  src="https://example.com/model.sog"
  scene-type="object"
  width="800px"
  height="480px">
</threedgs-viewer>
<script src="https://cdn.jsdelivr.net/gh/NegativeMind/web-3dgs@main/dist/3dgs-viewer.js"></script>
```

### 設定オプション

| 属性 | 必須 | 値 | 説明 |
|------|------|-----|------|
| `src` | ✅ | URL | 3DGS ファイルの URL（`.sog` / `.ply` / `.splat`） |
| `scene-type` | ❌ | `object` / `immersive` | 表示モード（デフォルト: `object`）<br><br>**object**: OrbitControls でモデルを回転・ズーム<br>**immersive**: FPS スタイルで空間内を移動 |
| `width` | ❌ | CSS 値 | ウィジェットの幅（例: `800px`, `100%`） |
| `height` | ❌ | CSS 値 | ウィジェットの高さ（例: `480px`） |
| `collision-src` | ❌ | URL | 衝突メッシュ（`.collision.glb`）の URL。immersive モードでの床・壁との衝突判定に使用 |
| `debug-collision` | ❌ | - | 衝突メッシュをワイヤーフレームで表示（デバッグ用） |

#### 使用例

```html
<!-- オブジェクト閲覧モード（デフォルト） -->
<threedgs-viewer src="https://example.com/model.sog" scene-type="object" width="800px" height="480px"></threedgs-viewer>

<!-- イマーシブモード（FPS 移動） -->
<threedgs-viewer src="https://example.com/scene.sog" scene-type="immersive" width="100%" height="600px"></threedgs-viewer>

<!-- 衝突判定あり -->
<threedgs-viewer src="https://example.com/scene.sog" scene-type="immersive" collision-src="https://negativemind.com/3dgs/gmk.collision.glb" width="100%" height="600px"></threedgs-viewer>

<!-- 衝突メッシュをデバッグ表示 -->
<threedgs-viewer src="https://example.com/scene.sog" scene-type="immersive" collision-src="https://negativemind.com/3dgs/gmk.collision.glb" debug-collision width="800px" height="480px"></threedgs-viewer>
```

## 開発

```bash
npm install
npm run dev          # 開発サーバー起動 (http://localhost:5173)
npm run typecheck    # TypeScript 型チェック
npm run build:widget # ウィジェット単体ビルド → dist/3dgs-viewer.js
npm run build        # ジェネレーターページビルド → dist/
npm run build:all    # 両方ビルド
```

### ローカルテスト

| ページ | URL | 説明 |
|--------|-----|------|
| ジェネレーター | `http://localhost:5173/` | 埋め込みコード生成 + プレビュー確認 |
| test-local | `http://localhost:5173/tests/test-local.html` | ウィジェットソースを直接読み込み（HMR 有効） |
| test-build | `http://localhost:5173/tests/test-build.html` | `npm run build:widget` 後のビルド成果物を確認 |
| test-cdn | `tests/test-cdn.html` を直接開く | jsDelivr CDN 配信版を確認 |

### プロジェクト構成

```
index.html              ← 開発環境ナビページ（npm run dev で起動）
embed-generator/        ← 埋め込みコードジェネレーター（GitHub Pages で公開）
tests/                  ← ローカル動作確認用テストページ
src/widget/             ← ウィジェットソース（<threedgs-viewer> Custom Element）
dist/                   ← ビルド成果物（dist/3dgs-viewer.js は CI が管理）
```

## CDN 配信

`main` ブランチへのプッシュ時に GitHub Actions がウィジェットをビルドし、`dist/3dgs-viewer.js` を自動コミットします。jsDelivr がそのファイルを配信します。

```
https://cdn.jsdelivr.net/gh/NegativeMind/web-3dgs@main/dist/3dgs-viewer.js
```

特定バージョンを固定したい場合はタグを指定します：

```
https://cdn.jsdelivr.net/gh/NegativeMind/web-3dgs@v0.0.0-beta/dist/3dgs-viewer.js
```

## ライセンス

[MIT License](./LICENSE)
