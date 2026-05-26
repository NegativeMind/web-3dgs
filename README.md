# web-3dgs

3D Gaussian Splatting viewer widget built with Vite, Three.js, and [Spark](https://sparkjs.dev/).

任意の Web ページに 1 行のスクリプトタグで 3DGS コンテンツを埋め込めます。

## 使い方

### 埋め込みコードジェネレーター

GitHub Pages の[ジェネレーターページ](https://negativemind.github.io/web-3dgs/)で 3DGS ファイルの URL を入力すると、埋め込みコードを生成できます。

### 手動埋め込み

```html
<threedgs-viewer
  src="https://example.com/model.sog"
  scene-type="object"
  width="100%"
  height="480px">
</threedgs-viewer>
<script src="https://cdn.jsdelivr.net/gh/NegativeMind/web-3dgs@main/cdn/widget.js"></script>
```

### 属性

| 属性 | 値 | 説明 |
|---|---|---|
| `src` | URL | 3DGS ファイルの URL（`.sog` / `.ply` / `.splat`） |
| `scene-type` | `object` (default) | OrbitControls でモデルを回転・ズーム |
| `scene-type` | `immersive` | FPS スタイルで空間内を移動 |

## 機能

- `.sog` / `.ply` / `.splat` 形式の 3DGS ファイルをロード
- **object モード**: OrbitControls でモデルを周回・ズーム
- **immersive モード**: Spark の FPS/ポインターコントロールで空間移動
- WebXR 対応（AR/MR パススルー優先、VR フォールバック）
- Meta Quest での XR 操作:
  - トリガー/スクイーズドラッグでモデル回転
  - リリース後に慣性スピン
  - ジョイスティック上下でズーム
- Custom Element として Shadow DOM で外部スタイルと完全分離

## 開発

```bash
npm install
npm run dev          # ウィジェットビルド後に開発サーバー起動 (http://localhost:5173)
npm run typecheck    # TypeScript 型チェック
npm run build:widget # ウィジェット単体ビルド → cdn/widget.js
npm run build        # ジェネレーターページビルド → dist/
npm run build:all    # 両方ビルド
```

### プロジェクト構成

```
src/
├── index.html          ← 埋め込みコードジェネレーターページ
├── main.ts             ← ジェネレーター UI ロジック
├── style.scss          ← ジェネレーターページスタイル
└── widget/
    ├── index.ts        ← <threedgs-viewer> Custom Element 定義
    ├── 3dgs-viewer.ts  ← ThreeDgsViewer クラス（レンダラー・XR・リサイズ）
    ├── xrObjectControls.ts ← XR コントローラー入力・慣性
    └── style.scss      ← Shadow DOM 内スタイル

public/3dgs/            ← 開発用 3DGS アセット
cdn/                    ← ビルド済みウィジェット（CI が管理、jsDelivr 配信）
```

## CDN 配信

`main` ブランチへのプッシュ時に GitHub Actions がウィジェットをビルドし、`cdn/widget.js` を自動コミットします。jsDelivr がそのファイルを配信します。

```
https://cdn.jsdelivr.net/gh/NegativeMind/web-3dgs@main/cdn/widget.js
```

特定バージョンを固定したい場合はタグを指定します：

```
https://cdn.jsdelivr.net/gh/NegativeMind/web-3dgs@v1.0.0/cdn/widget.js
```

## デプロイ

`main` への push で GitHub Actions が GitHub Pages へ自動デプロイします。リポジトリの Settings → Pages → Source を **GitHub Actions** に設定してください。
