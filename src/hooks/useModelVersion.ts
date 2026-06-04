import { useState, useCallback } from 'react'
import type { OcrModelVersion } from '../ocr/model-loader'
import { DEFAULT_OCR_VERSION } from '../ocr/model-loader'

const STORAGE_KEY = 'honkoku_model_version'

function getStored(): OcrModelVersion {
  // v7/v8/v11 は UI から廃止(localStorage に残っていても DEFAULT=v12 に migrate)。
  // v12/v13 のみ残し、それ以外は DEFAULT へ。
  const v = localStorage.getItem(STORAGE_KEY)
  return v === 'v12' || v === 'v13' ? v : DEFAULT_OCR_VERSION
}

/**
 * OCR enc-dec モデルの版(v12/v13)の保持と切替。localStorage に永続化する。
 * version を変えると useOCRWorker がワーカーを作り直し、対応するモデルを
 * （キャッシュ済みなら即時に）ロードし直す。
 */
export function useModelVersion() {
  const [modelVersion, setVersion] = useState<OcrModelVersion>(getStored)

  const setModelVersion = useCallback((next: OcrModelVersion) => {
    localStorage.setItem(STORAGE_KEY, next)
    setVersion(next)
  }, [])

  return { modelVersion, setModelVersion }
}
