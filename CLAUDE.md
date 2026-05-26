# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # ウィジェットビルド後に開発サーバー起動 (http://localhost:5173)
npm run build:widget # ウィジェット単体ビルド → cdn/widget.js
npm run build        # ジェネレーターページビルド → dist/
npm run build:all    # ウィジェット + ページを両方ビルド
npm run preview      # ビルド済み dist/ をローカルでプレビュー
npm run typecheck    # TypeScript 型チェック単体実行
```

## アーキテクチャ

### ディレクトリ構成

```
src/
├── index.html          ← 埋め込みコードジェネレーターページ（Vite root）
├── main.ts             ← ジェネレーターページの UI ロジック
├── style.scss          ← ジェネレーターページのスタイル
├── vite-env.d.ts       ← `?inline` インポート用型宣言
└── widget/
    ├── index.ts        ← Custom Element 定義（<threedgs-viewer>）
    ├── 3dgs-viewer.ts  ← ThreeDgsViewer クラス
    ├── xrObjectControls.ts ← XR コントローラー操作
    └── style.scss      ← Shadow DOM 内スタイル

public/3dgs/            ← 3DGS アセット（*.sog / *.ply / *.splat）
cdn/                    ← ビルド済みウィジェット（.gitignore、CI がコミット）
dist/                   ← ジェネレーターページビルド成果物（.gitignore）
```

### ウィジェット（Custom Element）

`<threedgs-viewer>` という Custom Element として実装。Shadow DOM でスタイルを分離している。

```html
<threedgs-viewer src="https://example.com/model.sog" scene-type="object" width="100%" height="480px"></threedgs-viewer>
<script src="https://cdn.jsdelivr.net/gh/NegativeMind/web-3dgs@main/cdn/widget.js"></script>
```

属性：
- `src` — 3DGS ファイルの URL（`.sog` / `.ply` / `.splat`）
- `scene-type` — `"object"`（OrbitControls）または `"immersive"`（FPS 移動）

`connectedCallback` でレンダラーを初期化し、`disconnectedCallback` で `dispose()` する。コンテナサイズ変化は `ResizeObserver` で検知する（`window.resize` ではない）。

### ウィジェットビルド設定（vite.widget.config.ts）

- IIFE 形式、`inlineDynamicImports: true`（単一ファイル出力）
- 出力先: `cdn/widget.js`（`emptyOutDir: true`）
- `publicDir: false`（公開アセットをバンドルに含めない）

### レンダリングの仕組み

`SparkRenderer`（`THREE.Mesh` のサブクラス）をシーンに追加すると、同じシーン内の `SplatMesh` を自動収集してレンダリングする。

```
THREE.Scene
├── SparkRenderer   ← spark.update({ scene, camera }) で毎フレーム更新
└── SplatMesh       ← scene.add() で追加（spark.add() ではない）
```

`SplatMesh` は `THREE.Object3D` を継承しているが、TypeScript の型定義でその継承プロパティ（`rotation`, `matrixWorld` 等）が公開されていない。操作時は `splatMesh as unknown as THREE.Object3D` でキャストする。

### COLMAP 座標系の補正

COLMAP SfM ベースの 3DGS データは Y 軸下向きのため、ロード後に `rotation.x = Math.PI` を適用する。

### ファイルロードフロー

1. `new SplatMesh({ url })` でロード開始（非同期）
2. `await splatMesh.initialized` でデータ確定を待機（60 秒タイムアウト付き）
3. `getBoundingBox()` → バウンディングボックス中心を `controls.target` にセット、カメラ距離を自動調整

### Vite 設定の注意点

- `vite.config.ts`: `root: "src"` のため `publicDir` は `"../public"` と明示指定が必要
- `@sparkjsdev/spark` は `optimizeDeps.exclude` に指定（WASM バンドルのため）
- `src/vite-env.d.ts` に `declare module "*.scss?inline"` が必要（Shadow DOM へのスタイル注入で使用）

## 依存関係の注意

- `three@^0.180` は型定義を同梱しないため `@types/three` が必須
- `@sparkjsdev/spark@^2.0.0` は `three@^0.180.0` をピア依存として要求

## CDN 配信と CI

`cdn/widget.js` はローカルでは `.gitignore` で無視される。GitHub Actions が以下を自動実行する：

- **`build-and-commit.yml`** — `main` への push 時に `src/` 変更を検知してウィジェットをビルドし、`cdn/widget.js` を `git add -f` でコミット
- **`release.yml`** — `v*.*.*` タグ付与時にビルド・コミットし、GitHub Release を作成

jsDelivr CDN URL:
```
https://cdn.jsdelivr.net/gh/NegativeMind/web-3dgs@main/cdn/widget.js
```

## デプロイ

`main` ブランチへのプッシュで GitHub Actions が自動実行され GitHub Pages に公開される。
リポジトリの Settings → Pages → Source を **GitHub Actions** に設定し、`github-pages` 環境を事前に作成しておく必要がある。
