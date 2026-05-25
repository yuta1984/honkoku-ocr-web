/** OCR Worker（レイアウト検出担当・単一インスタンス）のメッセージ */

import type { LineBox, RegionBox, ModelProgress } from './ocr'
import type { OcrModelVersion } from '../ocr/model-loader'

export type WorkerInMessage =
  | { type: 'INITIALIZE'; version: OcrModelVersion }
  | { type: 'LAYOUT_DETECT'; id: string; imageData: ImageData }
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
