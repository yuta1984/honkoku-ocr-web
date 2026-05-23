/** 認識 Worker（enc-dec 文字認識担当・CPU数ぶん並列起動）のメッセージ */

export interface RecJob {
  id: number              // 行のインデックス
  croppedImageData: ImageData
}

export type RecWorkerInMessage =
  | { type: 'REC_INIT' }
  | { type: 'REC_PROCESS'; jobs: RecJob[] }
  | { type: 'REC_TERMINATE' }

export type RecWorkerOutMessage =
  | { type: 'REC_READY' }
  | { type: 'REC_INIT_ERROR'; error: string }
  | { type: 'REC_LINE_DONE'; id: number; raw: string } // 1行認識完了（進捗用）
  | { type: 'REC_COMPLETE'; results: Array<{ id: number; raw: string }> }
  | { type: 'REC_ERROR'; error: string }
