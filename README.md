# [Web 3D Gaussian Splatting Viewer Widget (Beta)](https://negativemind.com/web-3dgs/)

[![Version](https://img.shields.io/badge/version-0.0.0--beta-blue)](https://github.com/NegativeMind/web-3dgs/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6.3-646cff?logo=vite&logoColor=white)](https://vite.dev/)
[![Three.js](https://img.shields.io/badge/Three.js-0.180-black?logo=threedotjs&logoColor=white)](https://threejs.org/)
[![Spark](https://img.shields.io/badge/Spark-2.0-ff6b35)](https://sparkjs.dev/)
[![GitHub Pages](https://github.com/NegativeMind/web-3dgs/actions/workflows/deploy.yml/badge.svg)](https://github.com/NegativeMind/web-3dgs/actions/workflows/deploy.yml)

> ⚠️ まだバージョン1未満のベータ版です。仕様が予告なく変更される可能性があります。

`.ply` / `.splat` / `.spz` / `.ksplat` / `.rad` / `.sog` 形式の3D Gaussian Splattingファイルを任意のWebページに埋め込めるウィジェットスクリプトです。
OrbitControls によるオブジェクト閲覧モードと、FPS スタイルで空間を歩き回るイマーシブモードの2種類に対応しています。
WebXRにも対応しており、Meta Quest などのVR/MRデバイスで没入体験できます。

<h1 align="center">
<a href="https://negativemind.com/web-3dgs/" target="_blank">
  <img src="assets/demo.gif" alt="Web 3D Gaussian Splatting Viewer Widget Demo" width="512">
</a>
</h1>

[埋め込みコード作成ツール](https://negativemind.com/web-3dgs/)を用意しています。

## 使い方

### 1. 埋め込みコードを生成する

[ジェネレーターページ](https://negativemind.com/web-3dgs/)で 3DGS ファイルの URL を入力すると、埋め込みコードを自動生成できます。

### 2. コード埋め込み

生成されたコード、または以下のコードの `src` 属性を使用したい 3DGS ファイルの URL に書き換えて貼り付けてください。

```html
<splat-viewer src="https://example.com/model.sog"></splat-viewer>
<script src="https://cdn.jsdelivr.net/gh/NegativeMind/web-3dgs@main/dist/3dgs-viewer.js"></script>
```

### 設定オプション

| 属性 | 必須 | 値 | 説明 |
|------|------|-----|------|
| `src` | ✅ | URL | 3DGS ファイルの URL（`.ply` / `.splat` / `.spz` / `.ksplat` / `.rad` / `.sog`） |
| `scene-type` | ❌ | `object` / `immersive` | 表示モード（デフォルト: `object`）<br><br>**object**: OrbitControls でモデルを回転・ズーム<br>**immersive**: FPS スタイルで空間内を移動 |
| `width` | ❌ | CSS 値 | ウィジェットの幅（例: `100%`, `800px`）。省略時は親要素の幅に追従 |
| `height` | ❌ | CSS 値 | ウィジェットの高さ（例: `56%`, `450px`）。省略時は幅と同じ（正方形） |
| `collision-src` | ❌ | URL | 衝突メッシュ（`.collision.glb`）の URL。immersive モードでの床・壁との衝突判定に使用 |
| `debug-collision` | ❌ | - | 衝突メッシュをワイヤーフレームで表示（デバッグ用） |

#### 使用例

```html
<!-- 最小構成（幅: 親要素に追従、高さ: 幅と同じ） -->
<splat-viewer src="https://example.com/model.sog"></splat-viewer>

<!-- サイズ指定 -->
<splat-viewer src="https://example.com/model.sog" width="800px" height="450px"></splat-viewer>

<!-- イマーシブモード（FPS 移動） -->
<splat-viewer src="https://example.com/scene.sog" scene-type="immersive" width="100%" height="600px"></splat-viewer>

<!-- 衝突判定あり -->
<splat-viewer src="https://example.com/scene.sog" scene-type="immersive" collision-src="https://negativemind.com/3dgs/gmk.collision.glb" width="100%" height="600px"></splat-viewer>

<!-- 衝突メッシュをデバッグ表示 -->
<splat-viewer src="https://example.com/scene.sog" scene-type="immersive" collision-src="https://negativemind.com/3dgs/gmk.collision.glb" debug-collision></splat-viewer>
```

## CDN URL

常に最新版を使用する場合：

```
https://cdn.jsdelivr.net/gh/NegativeMind/web-3dgs@main/dist/3dgs-viewer.js
```

特定バージョンを固定したい場合はタグを指定します：

```
https://cdn.jsdelivr.net/gh/NegativeMind/web-3dgs@v0.0.0-beta/dist/3dgs-viewer.js
```

## ライセンス

[MIT License](./LICENSE)
