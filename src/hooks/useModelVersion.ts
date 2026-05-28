import { useState, useCallback } from 'react'
import type { OcrModelVersion } from '../ocr/model-loader'
import { DEFAULT_OCR_VERSION } from '../ocr/model-loader'

const STORAGE_KEY = 'honkoku_model_version'

function getStored(): OcrModelVersion {
  const v = localStorage.getItem(STORAGE_KEY)
  return v === 'v7' || v === 'v8' || v === 'v11' ? v : DEFAULT_OCR_VERSION
}

/**
 * OCR enc-dec モデルの版(v7/v8)の保持と切替。localStorage に永続化する。
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
