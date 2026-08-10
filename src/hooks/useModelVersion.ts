import { useState, useCallback } from 'react'
import type { OcrModelVersion } from '../ocr/model-loader'
import { DEFAULT_OCR_VERSION } from '../ocr/model-loader'

const STORAGE_KEY = 'honkoku_model_version'

function getStored(): OcrModelVersion {
  // 設定 UI に出すのは v17(既定) と v12 のみ。v7/v8/v11/v13/v16fs は廃止済みで、
  // localStorage に残っていても許可リスト外なので DEFAULT(=v17) へ migrate される。
  // v13 は許可リストに残してあるため、選択済みユーザーはそのまま維持される。
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
