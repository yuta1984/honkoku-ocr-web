import { useState, useCallback } from 'react'

const STORAGE_KEY = 'honkoku_show_guide'

function getStored(): boolean {
  // 既定は表示。明示的に 'false' が保存されていたときだけ非表示。
  return localStorage.getItem(STORAGE_KEY) !== 'false'
}

/**
 * ガイドメッセージ（②③ 手順や OCR 完了通知などの吹き出し）の表示/非表示の
 * 設定を保持する。localStorage に永続化する。
 */
export function useShowGuide() {
  const [showGuide, setShow] = useState<boolean>(getStored)

  const setShowGuide = useCallback((next: boolean) => {
    localStorage.setItem(STORAGE_KEY, String(next))
    setShow(next)
  }, [])

  return { showGuide, setShowGuide }
}
