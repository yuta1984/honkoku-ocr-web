import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import type { PageItem, ProcessedImage, JobProgress, ImageStatus, BoundingBox } from './types/ocr'
import { useI18n } from './hooks/useI18n'
import { useOCRWorker } from './hooks/useOCRWorker'
import { useFileProcessor } from './hooks/useFileProcessor'
import { Header } from './components/layout/Header'
import { Footer } from './components/layout/Footer'
import { ImageViewer } from './components/viewer/ImageViewer'
import { ResultPanel } from './components/results/ResultPanel'
import { SettingsModal } from './components/settings/SettingsModal'
import { DownloadMenu } from './components/common/DownloadMenu'
import { decodeBlobToImageData } from './utils/imageLoader'
import { downloadPages, type ExportFormat } from './utils/textExport'
import './App.css'

const STATUS_LABEL: Record<ImageStatus, { ja: string; en: string; cls: string }> = {
  unprocessed: { ja: '未処理', en: 'Pending', cls: 'st-none' },
  layout: { ja: 'レイアウト認識済み', en: 'Layout', cls: 'st-layout' },
  ocr: { ja: 'OCR済み', en: 'Done', cls: 'st-ocr' },
}

const idleJob: JobProgress = { active: false, kind: null, current: 0, total: 0, stage: '', detail: 0, message: '' }

export default function App() {
  const { lang, toggleLanguage } = useI18n()
  const { isReady, modelState, detectLayout, recognizeLines } = useOCRWorker()
  const { isLoading: isLoadingFiles, fileLoadingState, loadFiles } = useFileProcessor()

  const [pages, setPages] = useState<PageItem[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedOrder, setSelectedOrder] = useState<number | null>(null)
  const [job, setJob] = useState<JobProgress>(idleJob)
  const [showSettings, setShowSettings] = useState(false)
  const [rightWidth, setRightWidth] = useState(480)   // 翻刻パネル幅(px、ドラッグで変更)
  const [rightVisible, setRightVisible] = useState(true)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const pagesRef = useRef<PageItem[]>(pages)
  useEffect(() => { pagesRef.current = pages }, [pages])

  // 画像は「縮小済み圧縮Blob」で保持し、展開(ImageData化)は処理時に遅延する（メモリ節約）。
  // React state には載せず id キーの Map で別管理。
  const imageStore = useRef<Map<string, Blob>>(new Map())

  const selectedPage = useMemo(() => pages.find((p) => p.id === selectedId) ?? null, [pages, selectedId])

  // 選択画像の表示用 URL（OSD）。Blob の object URL を直接渡し、巨大 ImageData をJSヒープに置かない。
  const [selectedDataUrl, setSelectedDataUrl] = useState('')
  useEffect(() => {
    const blob = selectedId ? imageStore.current.get(selectedId) : undefined
    if (!blob) { setSelectedDataUrl(''); return }
    const url = URL.createObjectURL(blob)
    setSelectedDataUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [selectedId])

  const updatePage = useCallback((id: string, patch: Partial<PageItem>) => {
    setPages((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  }, [])

  // --- 行bboxの編集（選択画像に対して） --------------------------------------
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

  // 矢印キーで読み順入替（←=後ろへ +1 / →=前へ -1）、Delete で削除
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

  // --- 画像追加 ------------------------------------------------------------
  const addImages = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return
      const imgs: ProcessedImage[] = await loadFiles(files)
      if (imgs.length === 0) return
      setPages((prev) => {
        const base = prev.length
        const items: PageItem[] = imgs.map((img, i) => {
          const id = `page-${Date.now()}-${base + i}`
          // 圧縮Blobを Map へ（展開は処理時に遅延）
          imageStore.current.set(id, img.blob)
          return {
            id,
            index: base + i + 1,
            fileName: img.fileName,
            pageIndex: img.pageIndex,
            width: img.width,
            height: img.height,
            thumbnailDataUrl: img.thumbnailDataUrl,
            status: 'unprocessed' as const,
            lines: [],
            regions: [],
          }
        })
        const next = [...prev, ...items]
        if (prev.length === 0) {
          // 最初の追加で先頭を選択
          queueMicrotask(() => setSelectedId(items[0].id))
        }
        return next
      })
    },
    [loadFiles]
  )

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) addImages(Array.from(e.target.files))
      e.target.value = ''
    },
    [addImages]
  )

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

  const handleClearAll = useCallback(() => {
    setPages([])
    setSelectedId(null)
    setSelectedOrder(null)
    setJob(idleJob)
    imageStore.current.clear()
  }, [])

  // --- レイアウト認識 ------------------------------------------------------
  const runLayout = useCallback(
    async (ids: string[]) => {
      const targets = ids.filter((id) => pagesRef.current.some((p) => p.id === id))
      if (targets.length === 0) return
      setJob({ active: true, kind: 'layout', current: 0, total: targets.length, stage: 'レイアウト認識', detail: 0, message: '' })
      for (let i = 0; i < targets.length; i++) {
        const id = targets[i]
        const page = pagesRef.current.find((p) => p.id === id)!
        const blob = imageStore.current.get(id)
        if (!blob) continue
        setJob((j) => ({ ...j, current: i + 1, detail: 0, message: `${page.fileName} を解析中...` }))
        try {
          const imageData = await decodeBlobToImageData(blob) // 処理直前に展開
          const { lines, regions } = await detectLayout(imageData)
          updatePage(id, { lines, regions, status: 'layout' })
        } catch (err) {
          console.error('layout failed', err)
        }
      }
      setJob(idleJob)
    },
    [detectLayout, updatePage]
  )

  // --- OCR 実行（必要なら先にレイアウト認識） ------------------------------
  const runOCR = useCallback(
    async (ids: string[]) => {
      const targets = ids.filter((id) => pagesRef.current.some((p) => p.id === id))
      if (targets.length === 0) return
      setJob({ active: true, kind: 'ocr', current: 0, total: targets.length, stage: 'OCR', detail: 0, message: '' })
      for (let i = 0; i < targets.length; i++) {
        const id = targets[i]
        let page = pagesRef.current.find((p) => p.id === id)!
        const blob = imageStore.current.get(id)
        if (!blob) continue
        setJob((j) => ({ ...j, current: i + 1, detail: 0, message: `${page.fileName}` }))
        const imageData = await decodeBlobToImageData(blob) // 処理直前に展開（このループ反復のみ保持）

        // レイアウト未実施なら先に検出
        if (page.status === 'unprocessed' || page.lines.length === 0) {
          try {
            setJob((j) => ({ ...j, stage: 'レイアウト認識', message: `${page.fileName} のレイアウトを認識中...` }))
            const { lines, regions } = await detectLayout(imageData)
            updatePage(id, { lines, regions, status: 'layout' })
            page = { ...page, lines, regions, status: 'layout' }
          } catch (err) {
            console.error('layout (pre-ocr) failed', err)
            continue
          }
        }
        if (page.lines.length === 0) {
          updatePage(id, { status: 'ocr' })
          continue
        }

        setJob((j) => ({ ...j, stage: 'OCR', message: `${page.fileName} を認識中...` }))
        try {
          const map = await recognizeLines(imageData, page.lines, (done, total) => {
            setJob((j) => ({ ...j, detail: total > 0 ? done / total : 0, message: `${page.fileName}：${done}/${total} 行` }))
          })
          const newLines = page.lines.map((l, idx) => ({ ...l, raw: map.get(idx) ?? '' }))
          updatePage(id, { lines: newLines, status: 'ocr' })
        } catch (err) {
          console.error('ocr failed', err)
        }
      }
      setJob(idleJob)
    },
    [detectLayout, recognizeLines, updatePage]
  )

  const selectPage = useCallback((id: string) => {
    setSelectedId(id)
    setSelectedOrder(null)
  }, [])

  // ビューアと翻刻パネルの境界ドラッグ（右パネル幅を変更）
  const startSplitDrag = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    const onMove = (ev: PointerEvent) => {
      const w = window.innerWidth - ev.clientX
      setRightWidth(Math.max(280, Math.min(window.innerWidth - 420, w)))
    }
    const onUp = () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [])

  const busy = job.active || isLoadingFiles
  const canProcess = isReady && !busy
  // OCR は行bbox（レイアウト認識結果）が前提。未処理の画像では実行不可。
  const selectedNeedsLayout = !selectedPage || selectedPage.status === 'unprocessed'
  const anyUnprocessed = pages.length === 0 || pages.some((p) => p.status === 'unprocessed')
  const ocrHint = lang === 'ja' ? '先にレイアウト認識を実行してください' : 'Run layout recognition first'
  const ocrPages = pages.filter((p) => p.lines.some((l) => l.raw != null))
  const handleBatchDownload = async (fmt: ExportFormat) => {
    if (ocrPages.length === 0) return
    try {
      await downloadPages(ocrPages, fmt, `みんなで翻刻OCR_${ocrPages.length}件`, true)
    } catch (e) {
      console.error('export failed:', e)
      alert(lang === 'ja' ? 'ファイル変換に失敗しました' : 'Export failed')
    }
  }

  return (
    <div className="app">
      <Header
        lang={lang}
        onToggleLanguage={toggleLanguage}
        onOpenSettings={() => setShowSettings(true)}
        onLogoClick={handleClearAll}
      />

      {/* モデルダウンロード/初期化ステータスバー */}
      {modelState.status !== 'ready' && (
        <div className={`statusbar ${modelState.status === 'error' ? 'statusbar-error' : ''}`}>
          <div className="statusbar-row">
            <span className="statusbar-msg">
              {modelState.status === 'error'
                ? `${modelState.message}: ${modelState.error ?? ''}`
                : modelState.message || (lang === 'ja' ? 'モデルを準備中...' : 'Preparing models...')}
            </span>
            {modelState.status !== 'error' && (
              <span className="statusbar-pct">{Math.round(modelState.progress * 100)}%</span>
            )}
          </div>
          {modelState.status !== 'error' && (
            <div className="bar-track">
              <div className="bar-fill" style={{ width: `${Math.round(modelState.progress * 100)}%` }} />
            </div>
          )}
          {modelState.modelProgress && (
            <div className="statusbar-models">
              {([['layout', 'レイアウト'], ['encoder', 'エンコーダ'], ['decoder', 'デコーダ']] as const).map(([k, label]) => (
                <span key={k} className="statusbar-model">
                  {label} {Math.round((modelState.modelProgress![k]) * 100)}%
                </span>
              ))}
            </div>
          )}
          {modelState.status !== 'error' && modelState.progress < 0.95 && (
            <p className="statusbar-note">
              {lang === 'ja'
                ? '初回のみモデル(約120MB)をダウンロードします。次回からはキャッシュから高速起動します。'
                : 'Models (~120MB) download once on first run, then load instantly from cache.'}
            </p>
          )}
        </div>
      )}

      <main className="main">
        {/* 左サイドバー: 画像一覧 + ステータス */}
        <aside className="sidebar">
          <div className="sidebar-actions">
            <button className="btn btn-primary btn-block" onClick={() => fileInputRef.current?.click()} disabled={isLoadingFiles}>
              {lang === 'ja' ? '＋ 画像を追加' : '＋ Add images'}
            </button>
            <button className="btn btn-secondary btn-block" onClick={handlePaste} disabled={isLoadingFiles}>
              {lang === 'ja' ? 'クリップボードから貼り付け' : 'Paste from clipboard'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/jpeg,image/png,image/tiff,image/heic,image/heif,.tif,.tiff,.heic,.heif,application/pdf"
              onChange={handleFileInput}
              style={{ display: 'none' }}
            />
          </div>

          <div className="sidebar-list">
            {pages.length === 0 && (
              <p className="sidebar-empty">
                {lang === 'ja' ? '画像が追加されていません' : 'No images yet'}
              </p>
            )}
            {pages.map((p) => {
              const st = STATUS_LABEL[p.status]
              return (
                <button
                  key={p.id}
                  className={`sidebar-item ${p.id === selectedId ? 'active' : ''}`}
                  onClick={() => selectPage(p.id)}
                  title={p.pageIndex ? `${p.fileName} (p.${p.pageIndex})` : p.fileName}
                >
                  <span className="sidebar-index">{p.index}</span>
                  <img className="sidebar-thumb" src={p.thumbnailDataUrl} alt={p.fileName} />
                  <span className="sidebar-meta">
                    <span className="sidebar-name">
                      {p.pageIndex ? `${p.fileName} (p.${p.pageIndex})` : p.fileName}
                    </span>
                    <span className={`status-badge ${st.cls}`}>{lang === 'ja' ? st.ja : st.en}</span>
                  </span>
                </button>
              )
            })}
          </div>

          {pages.length > 0 && (
            <div className="sidebar-batch">
              <div className="sidebar-batch-title">{lang === 'ja' ? '一括処理' : 'Batch'}</div>
              <button className="btn btn-outline btn-block" disabled={!canProcess} onClick={() => runLayout(pages.map((p) => p.id))}>
                {lang === 'ja' ? '全画像レイアウト認識' : 'Layout all'}
              </button>
              <button
                className="btn btn-outline btn-block"
                disabled={!canProcess || anyUnprocessed}
                title={anyUnprocessed ? ocrHint : undefined}
                onClick={() => runOCR(pages.map((p) => p.id))}
              >
                {lang === 'ja' ? '全画像OCR実行' : 'OCR all'}
              </button>
              <DownloadMenu
                label={lang === 'ja' ? '認識テキストを保存' : 'Download text'}
                block
                disabled={ocrPages.length === 0}
                onSelect={handleBatchDownload}
              />
              <button className="btn btn-text btn-block" disabled={busy} onClick={handleClearAll}>
                {lang === 'ja' ? 'すべてクリア' : 'Clear all'}
              </button>
            </div>
          )}
        </aside>

        {/* 中央: ツールバー + OpenSeadragon ビューア */}
        <section className="center">
          <div className="toolbar">
            <div className="toolbar-left">
              <button className="btn btn-primary" disabled={!canProcess || !selectedPage} onClick={() => selectedPage && runLayout([selectedPage.id])}>
                {lang === 'ja' ? 'レイアウト認識' : 'Layout'}
              </button>
              <button
                className="btn btn-primary"
                disabled={!canProcess || selectedNeedsLayout}
                title={selectedNeedsLayout && selectedPage ? ocrHint : undefined}
                onClick={() => selectedPage && runOCR([selectedPage.id])}
              >
                {lang === 'ja' ? 'OCR実行' : 'OCR'}
              </button>
              {selectedPage && selectedPage.status !== 'unprocessed' && (
                <span className="edit-hint">
                  {lang === 'ja'
                    ? '行クリックで選択 → ドラッグ移動 / 四隅でリサイズ / × 削除 / ←→ 読み順入替'
                    : 'Click a line → drag move / corners resize / × delete / ←→ reorder'}
                </span>
              )}
            </div>
            <div className="toolbar-right">
              {selectedPage && (
                <span className="toolbar-info">
                  {selectedPage.pageIndex ? `${selectedPage.fileName} (p.${selectedPage.pageIndex})` : selectedPage.fileName}
                  {selectedPage.lines.length > 0 && ` / ${selectedPage.lines.length} ${lang === 'ja' ? '行' : 'lines'}`}
                </span>
              )}
              <button className="btn btn-secondary btn-sm" onClick={() => setRightVisible((v) => !v)}>
                {rightVisible
                  ? (lang === 'ja' ? '翻刻パネルを隠す ▶' : 'Hide panel ▶')
                  : (lang === 'ja' ? '◀ 翻刻パネルを表示' : '◀ Show panel')}
              </button>
            </div>
          </div>

          {/* 進捗バー */}
          {job.active && (
            <div className="jobbar">
              <div className="jobbar-row">
                <span className="jobbar-stage">
                  {job.kind === 'layout' ? (lang === 'ja' ? 'レイアウト認識' : 'Layout') : (lang === 'ja' ? 'OCR' : 'OCR')}
                  {job.total > 1 && `（${job.current}/${job.total}）`}
                </span>
                <span className="jobbar-msg">{job.message}</span>
              </div>
              <div className="bar-track">
                <div
                  className="bar-fill"
                  style={{ width: `${Math.round(((job.current - 1 + job.detail) / Math.max(1, job.total)) * 100)}%` }}
                />
              </div>
            </div>
          )}

          {isLoadingFiles && fileLoadingState && (
            <div className="jobbar">
              <div className="jobbar-row">
                <span className="jobbar-stage">{lang === 'ja' ? '読み込み中' : 'Loading'}</span>
                <span className="jobbar-msg">
                  {fileLoadingState.currentPage != null && fileLoadingState.totalPages != null
                    ? `${fileLoadingState.fileName} (${fileLoadingState.currentPage}/${fileLoadingState.totalPages})`
                    : fileLoadingState.fileName}
                </span>
              </div>
            </div>
          )}

          <div className="viewer-wrap">
            {selectedPage ? (
              <ImageViewer
                key={selectedPage.id}
                dataUrl={selectedDataUrl}
                lines={selectedPage.lines}
                regions={selectedPage.regions}
                showOverlays={selectedPage.status !== 'unprocessed'}
                selectedOrder={selectedOrder}
                onSelectLine={setSelectedOrder}
                onUpdateLine={updateLine}
                onDeleteLine={deleteLine}
              />
            ) : (
              <div className="viewer-placeholder">
                <div className="placeholder-icon">📜</div>
                <p>{lang === 'ja' ? '左の「画像を追加」から翻刻したい画像を読み込んでください' : 'Add images from the left panel to begin'}</p>
                <p className="placeholder-sub">{lang === 'ja' ? 'JPG / PNG / TIFF / HEIC / PDF・Ctrl+V で貼り付け可' : 'JPG / PNG / TIFF / HEIC / PDF · Ctrl+V to paste'}</p>
              </div>
            )}
          </div>
        </section>

        {/* ドラッグ可能な境界 */}
        {rightVisible && <div className="splitter" onPointerDown={startSplitDrag} title={lang === 'ja' ? 'ドラッグで幅を調整' : 'Drag to resize'} />}

        {/* 右: 縦書き翻刻パネル（ドラッグでリサイズ・非表示切替可） */}
        {rightVisible && (
          <aside className="right" style={{ flex: `0 0 ${rightWidth}px`, width: rightWidth }}>
            <ResultPanel item={selectedPage} selectedOrder={selectedOrder} onSelectLine={setSelectedOrder} lang={lang} />
          </aside>
        )}
      </main>

      <Footer lang={lang} />

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} lang={lang} />}
    </div>
  )
}
