import { useState, useRef, useCallback, useEffect } from 'react'

const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files')

/**
 * ファイルのドラッグ&ドロップ受付。dropProps を対象要素に spread し、dragOver で
 * オーバーレイを出す。ドロップ以外の場所でブラウザが画像を開いて遷移しないよう、
 * ウィンドウ全体でファイルドラッグの既定動作を抑止する。
 */
export function useFileDrop(onFiles: (files: File[]) => void) {
  const [dragOver, setDragOver] = useState(false)
  const depth = useRef(0)

  useEffect(() => {
    const prevent = (e: DragEvent) => {
      if (Array.from(e.dataTransfer?.types ?? []).includes('Files')) e.preventDefault()
    }
    window.addEventListener('dragover', prevent)
    window.addEventListener('drop', prevent)
    return () => {
      window.removeEventListener('dragover', prevent)
      window.removeEventListener('drop', prevent)
    }
  }, [])

  const onDragEnter = useCallback((e: React.DragEvent) => {
    if (!hasFiles(e)) return
    e.preventDefault()
    depth.current++
    setDragOver(true)
  }, [])
  const onDragOver = useCallback((e: React.DragEvent) => {
    if (!hasFiles(e)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, [])
  const onDragLeave = useCallback((e: React.DragEvent) => {
    if (!hasFiles(e)) return
    depth.current = Math.max(0, depth.current - 1)
    if (depth.current === 0) setDragOver(false)
  }, [])
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    depth.current = 0
    setDragOver(false)
    const files = Array.from(e.dataTransfer?.files ?? [])
    if (files.length > 0) onFiles(files)
  }, [onFiles])

  return { dragOver, dropProps: { onDragEnter, onDragOver, onDragLeave, onDrop } }
}
