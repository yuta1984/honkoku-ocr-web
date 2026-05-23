/**
 * みんなで翻刻OCR の中核データ型
 *
 * ワークフロー: 画像追加 → レイアウト認識(行検出+読み順) → OCR(行ごと enc-dec 認識)
 */

export interface BoundingBox {
  x: number
  y: number
  width: number
  height: number
}

/** koten-layout のクラスID */
export const LAYOUT_CLASS = {
  OVERALL: 0,      // 全体
  HANDWRITTEN: 1,  // 手書き（= 行）
  TYPOGRAPHY: 2,   // 活字（= 行）
  ILLUSTRATION: 3, // 図版
  STAMP: 4,        // 印判
} as const

/** OCR 対象となる行（手書き/活字）。レイアウト認識で読み順が付与される。 */
export interface LineBox extends BoundingBox {
  confidence: number
  classId: number      // 1=手書き, 2=活字
  readingOrder: number // 1始まり（XY-Cut で付与）
  /** OCR 後に格納される Koji 記法のトークン列（<ruby>… 等のタグを含む生文字列） */
  raw?: string
}

/** 行以外の検出領域（全体/図版/印判）。表示専用、OCR はしない。 */
export interface RegionBox extends BoundingBox {
  confidence: number
  classId: number
}

export interface LayoutResult {
  lines: LineBox[]
  regions: RegionBox[]
}

export type ImageStatus = 'unprocessed' | 'layout' | 'ocr'

/** サイドバー1項目に対応する画像ページ（React state に置く軽量メタ）。
 *  フル解像度 ImageData は state に含めない（巨大バッファを React の
 *  描画ログ機構が走査すると Range/メモリ問題になるため、id をキーに
 *  App 側の ref Map に別管理する）。 */
export interface PageItem {
  id: string
  index: number          // 1始まりの表示インデックス
  fileName: string
  pageIndex?: number      // PDF/TIFF のページ番号（1始まり）
  width: number
  height: number
  thumbnailDataUrl: string
  status: ImageStatus
  lines: LineBox[]        // レイアウト認識後
  regions: RegionBox[]    // レイアウト認識後
  layoutTimeMs?: number
  ocrTimeMs?: number
}

/** ファイル読み込み時の中間表現（useFileProcessor が生成） */
export interface ProcessedImage {
  fileName: string
  pageIndex?: number
  imageData: ImageData
  thumbnailDataUrl: string
}

// --- 進捗表示 -------------------------------------------------------------

export interface ModelProgress {
  layout: number
  encoder: number
  decoder: number
}

export type WorkerStatus = 'idle' | 'loading_model' | 'ready' | 'error'

/** モデルのダウンロード/初期化状態（ステータスバー用） */
export interface ModelState {
  status: WorkerStatus
  progress: number     // 0..1
  message: string
  modelProgress?: ModelProgress
  error?: string
}

export type JobKind = 'layout' | 'ocr'

/** レイアウト/OCR 実行中の進捗状態 */
export interface JobProgress {
  active: boolean
  kind: JobKind | null
  current: number      // 処理済み画像数
  total: number        // 対象画像数
  stage: string        // ステージ説明
  detail: number       // 現在画像内の進捗 0..1
  message: string
}
