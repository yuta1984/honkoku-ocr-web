import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import type { PageItem, ProcessedImage, BoundingBox, LineBox } from '../types/ocr'
import { useFileProcessor } from './useFileProcessor'
import { rectsOverlap } from '../lib/geometry'

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

  // 単一画像を削除。選択中だった場合は隣の画像に選択を移す（無ければ null）。
  // 残った画像の index は 1..N に詰め直す。
  const removePage = useCallback((id: string) => {
    setPages((prev) => {
      const idx = prev.findIndex((p) => p.id === id)
      if (idx < 0) return prev
      const next = prev.filter((p) => p.id !== id).map((p, i) => ({ ...p, index: i + 1 }))
      imageStore.current.delete(id)
      setSelectedId((cur) => {
        if (cur !== id) return cur
        if (next.length === 0) return null
        return next[Math.min(idx, next.length - 1)].id
      })
      return next
    })
    setSelectedOrder(null)
  }, [])

  // --- 画像追加（追加した先頭の画像を自動選択） ---
  const addImages = useCallback(async (files: File[]) => {
    if (files.length === 0) return
    const imgs: ProcessedImage[] = await loadFiles(files)
    if (imgs.length === 0) return
    const base = pagesRef.current.length
    const items: PageItem[] = imgs.map((img, i) => {
      const id = `page-${Date.now()}-${base + i}`
      imageStore.current.set(id, img.blob) // 圧縮Blobを Map へ（展開は処理時に遅延）
      return {
        id, index: base + i + 1, fileName: img.fileName, pageIndex: img.pageIndex,
        width: img.width, height: img.height, thumbnailDataUrl: img.thumbnailDataUrl,
        status: 'unprocessed' as const, lines: [], regions: [],
      }
    })
    setPages((prev) => [...prev, ...items])
    setSelectedId(items[0].id) // 追加した画像を選択状態にする
    setSelectedOrder(null)
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

  // 行の OCR テキスト(raw)を上書き。Koji記法の生文字列をそのまま保存。
  const updateLineText = useCallback((order: number, raw: string) => {
    setPages((prev) => prev.map((p) =>
      p.id === selectedId
        ? { ...p, lines: p.lines.map((l) => (l.readingOrder === order ? { ...l, raw } : l)) }
        : p
    ))
  }, [selectedId])

  // OCR 逐次表示用: 指定ページの行を配列インデックスで raw 更新（認識1行完了ごと）。
  const updateLineRaw = useCallback((pageId: string, lineIndex: number, raw: string) => {
    setPages((prev) => prev.map((p) =>
      p.id === pageId
        ? { ...p, lines: p.lines.map((l, i) => (i === lineIndex ? { ...l, raw } : l)) }
        : p
    ))
  }, [])

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

  // 選択領域と重なる行をすべて削除し、残りの読み順を 1..N に詰め直す。
  const deleteLinesInRegion = useCallback((region: BoundingBox) => {
    setPages((prev) => prev.map((p) => {
      if (p.id !== selectedId) return p
      const remaining = p.lines
        .filter((l) => !rectsOverlap(l, region))
        .sort((a, b) => a.readingOrder - b.readingOrder)
        .map((l, i) => ({ ...l, readingOrder: i + 1 }))
      return { ...p, lines: remaining }
    }))
    setSelectedOrder(null)
  }, [selectedId])

  // 選択行の読み順を隣と入替（later=後ろへ +1 / earlier=前へ -1）。選択は同じ行に追従。
  const swapOrder = useCallback((dir: 'later' | 'earlier') => {
    if (selectedOrder == null || !selectedId) return
    const page = pagesRef.current.find((p) => p.id === selectedId)
    if (!page) return
    const target = dir === 'later' ? selectedOrder + 1 : selectedOrder - 1
    if (!page.lines.some((l) => l.readingOrder === target)) return
    updatePage(page.id, {
      lines: page.lines.map((l) =>
        l.readingOrder === selectedOrder ? { ...l, readingOrder: target }
          : l.readingOrder === target ? { ...l, readingOrder: selectedOrder } : l
      ),
    })
    setSelectedOrder(target)
  }, [selectedId, selectedOrder, updatePage])

  // 選択画像に新しい行を追加（末尾番号）。追加した行を選択。
  // visibleBounds が渡されればその中央に、サイズも可視領域内に収まるよう調整して配置する
  // （ImageViewer の現在の OSD viewport から画像座標系で取得）。未指定なら画像全体を使う。
  const addLine = useCallback((visibleBounds?: BoundingBox) => {
    const page = pagesRef.current.find((p) => p.id === selectedId)
    if (!page) return
    const newOrder = page.lines.reduce((m, l) => Math.max(m, l.readingOrder), 0) + 1
    const visX = visibleBounds?.x ?? 0
    const visY = visibleBounds?.y ?? 0
    const visW = visibleBounds?.width ?? page.width
    const visH = visibleBounds?.height ?? page.height
    // 幅 = 画像幅の 6%（最小 24px）。可視幅を超えそうなら可視幅の 30% まで縮める。
    const w = Math.min(Math.max(24, Math.round(page.width * 0.06)), Math.max(24, Math.round(visW * 0.3)))
    // 高さ = 画像高さの 60%。可視高さの 80% を超えないように上限を設ける。
    const h = Math.min(Math.round(page.height * 0.6), Math.max(40, Math.round(visH * 0.8)))
    // 可視領域の中央に置く。画像範囲外にはみ出さないようクランプ。
    const cx = visX + visW / 2
    const cy = visY + visH / 2
    const newLine: LineBox = {
      x: Math.max(0, Math.min(page.width - w, Math.round(cx - w / 2))),
      y: Math.max(0, Math.min(page.height - h, Math.round(cy - h / 2))),
      width: w, height: h, classId: 1, confidence: 1, readingOrder: newOrder,
    }
    updatePage(page.id, {
      lines: [...page.lines, newLine],
      status: page.status === 'unprocessed' ? 'layout' : page.status,
    })
    setSelectedOrder(newOrder)
  }, [selectedId, updatePage])

  // 矢印キーで読み順入替、Delete で削除、Esc で選択解除
  // capture 段階で listen し、左右キーは stopImmediatePropagation で OSD のキーボードパンを抑止する。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (selectedOrder == null || !selectedPage || selectedPage.status === 'unprocessed') return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopImmediatePropagation(); swapOrder('later') }
      else if (e.key === 'ArrowRight') { e.preventDefault(); e.stopImmediatePropagation(); swapOrder('earlier') }
      else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteLine(selectedOrder) }
      else if (e.key === 'Escape') { setSelectedOrder(null) }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [selectedOrder, selectedPage, swapOrder, deleteLine])

  return {
    pages, selectedId, selectedPage, selectedOrder, setSelectedOrder, selectedDataUrl,
    isLoadingFiles, fileLoadingState,
    pagesRef, getBlob,
    addImages, handlePaste, selectPage, clearAll, removePage, updatePage, updateLine, updateLineText, deleteLine,
    deleteLinesInRegion, swapOrder, addLine, updateLineRaw,
  }
}
