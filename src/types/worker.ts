/** OCR Worker（レイアウト検出担当・単一インスタンス）のメッセージ */

import type { LineBox, RegionBox, BoundingBox, ModelProgress } from './ocr'
import type { OcrModelVersion, LayoutModelVersion } from '../ocr/model-loader'

export type WorkerInMessage =
  | { type: 'INITIALIZE'; version: OcrModelVersion; layoutVersion: LayoutModelVersion }
  | {
      type: 'LAYOUT_DETECT'
      id: string
      imageData: ImageData
      // 指定時は imageData の region 部分のみを検出し、結果を全体座標へ戻して
      // mergeLines / mergeRegions（領域外で温存する既存要素）と統合・読み順再計算する。
      region?: BoundingBox
      mergeLines?: LineBox[]
      mergeRegions?: RegionBox[]
    }
  | { type: 'TERMINATE' }

export type WorkerOutMessage =
  | {
      type: 'INIT_PROGRESS'
      progress: number
      message: string
      modelProgress?: ModelProgress
    }
  | { type: 'INIT_DONE' }
  | { type: 'INIT_ERROR'; error: string }
  | {
      type: 'LAYOUT_DONE'
      id: string
      lines: LineBox[]
      regions: RegionBox[]
    }
  | { type: 'LAYOUT_ERROR'; id: string; error: string }
