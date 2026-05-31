import { useState, useCallback } from 'react'
import type { LayoutModelVersion } from '../ocr/model-loader'
import { DEFAULT_LAYOUT_VERSION } from '../ocr/model-loader'

const STORAGE_KEY = 'honkoku_layout_version'

function getStored(): LayoutModelVersion {
  const v = localStorage.getItem(STORAGE_KEY)
  return v === 'rtmdet' || v === 'yolo' ? v : DEFAULT_LAYOUT_VERSION
}

/**
 * レイアウト検出モデル(rtmdet/yolo)の保持と切替。localStorage に永続化。
 * 切り替えると useOCRWorker がワーカーを作り直し、対応するレイアウトモデルを
 * （キャッシュ済みなら即時に）ロードし直す。
 */
export function useLayoutVersion() {
  const [layoutVersion, setVersion] = useState<LayoutModelVersion>(getStored)

  const setLayoutVersion = useCallback((next: LayoutModelVersion) => {
    localStorage.setItem(STORAGE_KEY, next)
    setVersion(next)
  }, [])

  return { layoutVersion, setLayoutVersion }
}
