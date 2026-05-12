# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # 開発サーバー起動 (http://localhost:5173, ブラウザ自動オープン)
npm run build    # プロダクションビルド → dist/
npm run preview  # ビルド済み dist/ をローカルでプレビュー
```

TypeScript の型チェック単体実行:
```bash
npx --no-install vite build   # ビルドで型エラーも検出される（tsc --noEmit 相当）
```

## アーキテクチャ

### ディレクトリ構成

- `src/` — Vite の root。`index.html` / `main.ts` / `style.scss` のみ
- `public/3dgs/` — 3DGS アセット置き場。`*.sog` / `*.ply` / `*.splat` などをここに配置
- `dist/` — ビルド成果物（git 管理外）

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
2. `await splatMesh.initialized` でデータ確定を待機
3. `getBoundingBox()` → バウンディングボックス中心を `controls.target` にセット、カメラ距離を自動調整

### Vite 設定の注意点

- `root: "src"` のため `publicDir` は `"../public"` と明示指定が必要
- `@sparkjsdev/spark` は `optimizeDeps.exclude` から除外（WASM バンドルのため）

## 依存関係の注意

- `three@^0.180` は型定義を同梱しないため `@types/three` が必須
- `@sparkjsdev/spark@^2.0.0` は `three@^0.180.0` をピア依存として要求

## デプロイ

`main` ブランチへのプッシュで GitHub Actions が自動実行され GitHub Pages に公開される。
リポジトリの Settings → Pages → Source を **GitHub Actions** に設定し、`github-pages` 環境を事前に作成しておく必要がある。
