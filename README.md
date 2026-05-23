# みんなで翻刻OCR (honkoku-ocr-web)

**市民の力で作ったくずし字AI-OCR** — ブラウザ内で完結する くずし字（古典籍）OCR ツール。

👉 公開版: https://yuta1984.github.io/honkoku-ocr-web/

画像を **① レイアウト認識（行検出＋読み順推定）→ ② OCR（行ごとに認識）** の2段階で翻刻します。
推論はすべて WebAssembly / Web Worker でブラウザ内で実行され、**画像も翻刻結果も外部に送信されません**
（モデルファイルのみ初回ダウンロード）。

## 主な機能

- 画像追加: ファイル選択 / クリップボード貼り付け (Ctrl+V) / ドラッグ＆ドロップ・PDF / TIFF / HEIC 対応
- 左サイドバーに画像一覧（未処理 / レイアウト認識済み / OCR済み のステータス表示）
- 中央に [OpenSeadragon](https://openseadragon.github.io/) ビューア。レイアウト認識結果を **bbox＋読み順番号** で表示
- レイアウト認識後、行bboxを **移動・リサイズ・削除**、**←/→ キーで読み順入替**
- 行bboxにマウスオーバーで翻刻を **縦書きポップアップ** 表示
- 右パネルに全文翻刻を縦書き表示（「行」モード＝本文画像と連動 /「閲覧」モード＝[koji-lang](https://www.npmjs.com/package/koji-lang) で組版表示）
- 一括 / 個別の「レイアウト認識」「OCR実行」。OCR は CPU 数に応じた複数 Web Worker で並列実行
- ONNX モデルは初回のみダウンロードし IndexedDB にキャッシュ（次回以降は高速起動）

## モデル

| 用途 | モデル |
|------|--------|
| レイアウト検出 | 古典籍5クラス YOLO（全体/手書き/活字/図版/印判。手書き・活字 box = 行） |
| 行OCR | くずし字 v7（ConvNeXt エンコーダ + RoBERTa デコーダ, greedy）。出力は Koji 記法 |

学習データは「[みんなで翻刻](https://honkoku.org)」の翻刻テキストに基づきます。

## 開発

```bash
npm install
npm run dev      # http://localhost:5173/
npm run build    # dist/ を生成（base=/honkoku-ocr-web/）
```

モデル配信元は `.env` の `VITE_MODEL_BASE_URL` で切替（空＝同一オリジンの `public/models/`、
URL指定＝R2等。外部配信時はバケットに CORS 設定が必要）。

## デプロイ

`main` への push で GitHub Actions（[.github/workflows/deploy.yml](.github/workflows/deploy.yml)）が
ビルドし GitHub Pages へ公開します。

## 技術スタック

React 19 / Vite / TypeScript / onnxruntime-web (WASM, 単一スレッド) / OpenSeadragon / koji-lang / pdfjs

## 作成者・ライセンス

作成者: 橋本雄太（国立歴史民俗博物館 / 国立国会図書館 非常勤調査員） — CC BY 4.0
