# みんなで翻刻OCR

ブラウザ内で完結する くずし字（古典籍）OCR ツール。画像を ① レイアウト認識（行検出
＋読み順推定）→ ② OCR（行ごとに enc-dec 認識）の2段階で翻刻する。すべて WebAssembly /
Web Worker でローカル実行し、画像も結果も外部送信しない。

## 機能（要件）

- ONNX モデルは初回のみダウンロードし IndexedDB にキャッシュ（ステータスバー＋進捗表示）
- 画像追加: ファイル選択ダイアログ / クリップボード貼り付け（Ctrl+V）/ PDF・TIFF・HEIC 対応
- 追加画像はインデックス付きで左サイドバーに上から一覧表示。各画像は
  「未処理 / レイアウト認識済み / OCR済み」のステータスを持つ
- 中央に OpenSeadragon ビューア。レイアウト認識結果を bbox＋読み順番号でオーバーレイ表示
- 行 bbox にマウスオーバーで Koji 記法を縦書きツールチップ表示
- 右に読み順どおりの全文翻刻を縦書き表示。**「行」モード**（行ごとクリックで本文画像と
  ハイライト連動）と**「閲覧」モード**（`koji-lang` で parse→convertToHTML し、ふりがな/返点/
  送り仮名/割書を組版表示。CSS は `src/koji-view.css`）を切替。コピーは Koji 記法（（）等保持）
- 一括（全画像）/ 個別（選択画像）で「レイアウト認識」「OCR実行」を実行。進捗バー＋メッセージ
- レイアウト認識・OCR は Web Worker でバックグラウンド実行。OCR は CPU 数に応じた
  複数ワーカーでマルチスレッド実行

## モデル

| 用途 | モデル | 入出力 |
|------|--------|--------|
| レイアウト | `koten-layout-best.onnx`（YOLO 5クラス） | [1,3,640,640] レターボックス(pad114) → [1,9,8400]。クラス: 0全体/1手書き/2活字/3図版/4印判。**手書き・活字 box = 行** |
| OCRエンコーダ | `kuzushiji-v11-encoder-int8.onnx`（ConvNeXt-Base+2D位置埋込）※既定 | pixel_values[1,3,128,1024] → encoder_hidden_states[1,128,512] |
| OCRデコーダ | `kuzushiji-v11-decoder-int8.onnx`（RoBERTa, greedy, KVキャッシュ無し）※既定 | input_ids[1,T]+encoder_hidden_states → logits。CLS=2 から SEP=3 まで逐次生成 |

OCR enc-dec は設定で **v11（既定）/ v8 / v7** を切替可能（`OcrModelVersion`、localStorage 永続）。
v11 = v8レシピ + クリーンenrich。返点・送り仮名の F1 を改善し（返点 0.69→0.82、送り仮名 0.54→0.61）、
平文・ふりがなは v8 と同等以上（公平評価。詳細はメモリ demo-v11-enrich-result）。
**v11/v8 の vocab は同一**（同じ roberta-mlm-v6-final トークナイザ由来で 100% 一致）。
**重要**: 版ごとに token id→文字 の並びが異なる（v7 と v8/v11 は ~86% 違う）。版に対応する語彙を読むこと
（v7=`config/kuzushiji-vocab.json` / v8=`-v8.json` / v11=`-v11.json`、`text-recognizer.ts` の `vocabUrl`）。
混用すると全文字が別字に化ける（v8系を v7 語彙で復号→ CER 0.40 まで悪化、正しい語彙なら 0.19）。

### `<rt2>`（第2読み）の除去
モデルは `<rt2>` を過剰付与する（test gold 34件に対し v11 は ~1300件、大半が読みの“両賭け”重複）。
`text-recognizer.ts` の `decode()` 末尾で `<rt2>…</rt2>` を一律除去する（ふりがな領域CER 0.148→0.117 で検証）。
gold での出現は極稀なので全版で除去して問題ない。

### モデル配信（R2）
ONNX は R2（`VITE_MODEL_BASE_URL`）から配信。**新モデル追加時は int8 ONNX を R2 バケットへ
アップロードが必要**（vocab は app 同梱＝`public/config`、R2不要）。v11 のファイル名:
`kuzushiji-v11-encoder-int8.onnx` / `kuzushiji-v11-decoder-int8.onnx`。
int8 は ConvInteger/MatMulInteger を含み、onnxruntime-web(wasm) では動くが **Python CPU EP では
ConvInteger 未実装で動かない**（parity 検証は decoder のみ、encoder は v8 と同一 op 構成で担保）。

語彙は `public/config/kuzushiji-vocab.json`（5000トークン、index=token id）。
`<ruby>/<rt>/<KAERI>/<OKURI>/<WARI>/<TATE>/<BLOCK>` 等の Koji 特殊トークンを含む。

### 行 OCR 前処理（`to_pixel` を学習 eval transform と完全一致させること）
`demo_onnx_v7.py` 準拠。①幅>120px なら左45px crop（隣接行混入除去）②縦長なら90度
**時計回り**回転（PIL `rotate(-90, expand)` 相当）③高さ128 にアスペクト比保持リサイズ
（幅は最大1024）④右側を白パディング ⑤/255 後 ImageNet 正規化、NCHW。
この前処理を崩すと認識精度が大きく劣化する。

追加処理（text-recognizer.ts）:
- **行crop余白** (useOCRWorker `OCR_CROP_MARGIN=45`): 行bbox全4辺を45px拡張してcrop。
  左45pxは to_pixel の左クロップで相殺 → 実質 上/下/右 に余白（ふりがな=右側 を切らない）。
- **per-line deskew**: `to_pixel` 先頭で投影プロファイル法により行ごとの傾き角を推定
  （±12度探索、Σ列² 最大化）し |角|≥2度 のとき回転補正。直立行は無補正（ジッタ防止）。

## アーキテクチャ

```
useOCRWorker (hook)
 ├─ ocr.worker.ts (単一)        : 3モデルをDL→IndexedDBキャッシュ。layoutセッション化。
 │                                LAYOUT_DETECT で行/領域検出 + XY-Cut 読み順付与
 └─ recognition.worker.ts (N本) : 各々 encoder+decoder を保持。REC_PROCESS で行を
                                  enc-dec greedy 認識し Koji 生文字列を返す
```
- 初期化順: ocr.worker が全モデルをキャッシュ → INIT_DONE → N本の認識ワーカーが
  キャッシュから encoder/decoder をセッション化（巨大ファイルの並列重複DLを防ぐ）。
- N = `min(max(hardwareConcurrency-1, 1), 4)`（各ワーカーが enc+dec を持つためメモリ上限で cap）。
- 読み順は **レイアウト認識フェーズ**で確定（`ReadingOrderProcessor.orderLines`、テキスト不要の XY-Cut）。
- Koji 変換は `utils/koji.ts`（トークン→表層 `親（よみ）` `＿返点` `￣送り` `《割書：右｜左》`）。

## モデル配信（重要）

`VITE_MODEL_BASE_URL`（`.env`）でモデル配信元を切替える:
- **空（既定）**: 同一オリジンの `public/models/` から配信（CORS 不要・そのまま動く）。
- **R2 等の外部URL**: バケット直下から配信。ただし**ブラウザのクロスオリジン取得には
  バケット側 CORS 設定（GET/HEAD 許可＋ACAO ヘッダ）が必須**。未設定だと
  「モデルの読み込みに失敗しました: Failed to fetch」となり、進捗が出ないため
  「モデルロード前にハング」したように見える。

注: onnxruntime-web は単一スレッド（`numThreads=1`）で動かすため SharedArrayBuffer は不要。
よって COOP/COEP は付与しない（付けると外部 R2 等のクロスオリジン取得がブロックされる）。

## 技術スタック / デプロイ

React 19 + Vite 7 + TypeScript / onnxruntime-web(wasm) / OpenSeadragon / pdfjs。
**デプロイ = GitHub Pages**（repo `yuta1984/honkoku-ocr-web`、`.github/workflows/deploy.yml` が
main への push で `npm run build`→`dist/` を Pages へ。base=`/honkoku-ocr-web/`）。**Netlify は不使用**。
ONNX は R2 配信のため git 管理外（`public/models/*.onnx` は .gitignore）、vocab は build 同梱。作成者: 橋本雄太。
