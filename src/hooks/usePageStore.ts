import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import type { PageItem, ProcessedImage, BoundingBox } from '../types/ocr'
import { useFileProcessor } from './useFileProcessor'

/**
 * 画像ページの状態・選択・行bbox編集・画像データ(Blob)管理をまとめたストア。
 * フル解像度の画像は React state に載せず、id キーの Map(ref)で圧縮Blobとして保持する
 * （展開は処理時に遅延。巨大バッファを state/props に置かないため）。
 */
export function usePageStore() {
  const { isLoading: isLoadingFiles, fileLoadingState, loadFiles } = useFileProcessor()

  const [pages, setPages] = useState<PageItem[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedOrder, setSelectedOrder] = useState<number | null>(null)

  const imageStore = useRef<Map<string, Blob>>(new Map())
  const pagesRef = useRef<PageItem[]>(pages)
  useEffect(() => { pagesRef.current = pages }, [pages])

  const selectedPage = useMemo(() => pages.find((p) => p.id === selectedId) ?? null, [pages, selectedId])

  // 選択画像の表示用 URL（OSD）。Blob の object URL を直接渡す。
  const [selectedDataUrl, setSelectedDataUrl] = useState('')
  useEffect(() => {
    const blob = selectedId ? imageStore.current.get(selectedId) : undefined
    if (!blob) { setSelectedDataUrl(''); return }
    const url = URL.createObjectURL(blob)
    setSelectedDataUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [selectedId])

  const getBlob = useCallback((id: string) => imageStore.current.get(id), [])

  const updatePage = useCallback((id: string, patch: Partial<PageItem>) => {
    setPages((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  }, [])

  const selectPage = useCallback((id: string) => {
    setSelectedId(id)
    setSelectedOrder(null)
  }, [])

  const clearAll = useCallback(() => {
    setPages([])
    setSelectedId(null)
    setSelectedOrder(null)
    imageStore.current.clear()
  }, [])

  // --- 画像追加 ---
  const addImages = useCallback(async (files: File[]) => {
    if (files.length === 0) return
    const imgs: ProcessedImage[] = await loadFiles(files)
    if (imgs.length === 0) return
    setPages((prev) => {
      const base = prev.length
      const items: PageItem[] = imgs.map((img, i) => {
        const id = `page-${Date.now()}-${base + i}`
        imageStore.current.set(id, img.blob) // 圧縮Blobを Map へ（展開は処理時に遅延）
        return {
          id, index: base + i + 1, fileName: img.fileName, pageIndex: img.pageIndex,
          width: img.width, height: img.height, thumbnailDataUrl: img.thumbnailDataUrl,
          status: 'unprocessed' as const, lines: [], regions: [],
        }
      })
      if (prev.length === 0) queueMicrotask(() => setSelectedId(items[0].id))
      return [...prev, ...items]
    })
  }, [loadFiles])

  const handlePaste = useCallback(async () => {
    try {
      const items = await navigator.clipboard.read()
      const files: File[] = []
      for (const item of items) {
        for (const type of item.types) {
          if (type.startsWith('image/')) {
            const blob = await item.getType(type)
            files.push(new File([blob], `clipboard-${Date.now()}.${type.split('/')[1] || 'png'}`, { type }))
          }
        }
      }
      if (files.length > 0) addImages(files)
    } catch { /* permission denied / empty */ }
  }, [addImages])

  // グローバル Ctrl+V / Cmd+V でクリップボード画像を追加
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      const files: File[] = []
      for (const it of Array.from(items)) {
        if (it.type.startsWith('image/')) {
          const f = it.getAsFile()
          if (f) files.push(f)
        }
      }
      if (files.length > 0) addImages(files)
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [addImages])

  // --- 行bbox編集（選択画像に対して） ---
  const updateLine = useCallback((order: number, box: BoundingBox) => {
    setPages((prev) => prev.map((p) =>
      p.id === selectedId
        ? { ...p, lines: p.lines.map((l) => (l.readingOrder === order ? { ...l, ...box } : l)) }
        : p
    ))
  }, [selectedId])

  const deleteLine = useCallback((order: number) => {
    setPages((prev) => prev.map((p) => {
      if (p.id !== selectedId) return p
      const remaining = p.lines
        .filter((l) => l.readingOrder !== order)
        .sort((a, b) => a.readingOrder - b.readingOrder)
        .map((l, i) => ({ ...l, readingOrder: i + 1 })) // 読み順を 1..N に詰め直す
      return { ...p, lines: remaining }
    }))
    setSelectedOrder(null)
  }, [selectedId])

  // 矢印キーで読み順入替（←=後ろへ +1 / →=前へ -1）、Delete で削除、Esc で選択解除
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (selectedOrder == null || !selectedPage || selectedPage.status === 'unprocessed') return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const target = e.key === 'ArrowLeft' ? selectedOrder + 1 : selectedOrder - 1
        if (!selectedPage.lines.some((l) => l.readingOrder === target)) return
        e.preventDefault()
        updatePage(selectedPage.id, {
          lines: selectedPage.lines.map((l) =>
            l.readingOrder === selectedOrder ? { ...l, readingOrder: target }
              : l.readingOrder === target ? { ...l, readingOrder: selectedOrder } : l
          ),
        })
        setSelectedOrder(target)
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        deleteLine(selectedOrder)
      } else if (e.key === 'Escape') {
        setSelectedOrder(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedOrder, selectedPage, updatePage, deleteLine])

  return {
    pages, selectedId, selectedPage, selectedOrder, setSelectedOrder, selectedDataUrl,
    isLoadingFiles, fileLoadingState,
    pagesRef, getBlob,
    addImages, handlePaste, selectPage, clearAll, updatePage, updateLine, deleteLine,
  }
}
