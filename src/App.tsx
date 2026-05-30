import { useState, useCallback } from 'react'
import type { JobProgress } from './types/ocr'
import { useLang } from './hooks/useLang'
import { useFileDrop } from './hooks/useFileDrop'
import { useModelVersion } from './hooks/useModelVersion'
import { useOCRWorker } from './hooks/useOCRWorker'
import { usePageStore } from './hooks/usePageStore'
import { Header } from './ui/layout/Header'
import { StatusBar } from './ui/StatusBar'
import { JobBar } from './ui/JobBar'
import { PageSidebar } from './ui/sidebar/PageSidebar'
import { Toolbar } from './ui/toolbar/Toolbar'
import { ViewerBottomBar } from './ui/viewer/ViewerBottomBar'
import { ImageViewer } from './ui/viewer/ImageViewer'
import { ResultPanel } from './ui/results/ResultPanel'
import { SettingsModal } from './ui/settings/SettingsModal'
import { decodeBlobToImageData } from './lib/imageLoader'
import { downloadPages, type ExportFormat } from './lib/textExport'
import './styles/app.css'

const idleJob: JobProgress = { active: false, kind: null, current: 0, total: 0, stage: '', detail: 0, message: '' }

export default function App() {
  const { lang, toggleLanguage } = useLang()
  const { modelVersion, setModelVersion } = useModelVersion()
  const { isReady, modelState, detectLayout, recognizeLines } = useOCRWorker(modelVersion)
  const store = usePageStore()
  const {
    pages, selectedId, selectedPage, selectedOrder, setSelectedOrder, selectedDataUrl,
    isLoadingFiles, fileLoadingState, pagesRef, getBlob,
    addImages, handlePaste, selectPage, clearAll, removePage, updatePage, updateLine, updateLineText, deleteLine,
    swapOrder, addLine,
  } = store

  const [job, setJob] = useState<JobProgress>(idleJob)
  const [showSettings, setShowSettings] = useState(false)
  const [rightWidth, setRightWidth] = useState(480)   // 翻刻パネル幅(px、ドラッグで変更)
  const [rightVisible, setRightVisible] = useState(true)
  const { dragOver, dropProps } = useFileDrop(addImages)

  const handleClearAll = useCallback(() => { clearAll(); setJob(idleJob) }, [clearAll])

  // --- レイアウト認識 ---
  const runLayout = useCallback(async (ids: string[]) => {
    const targets = ids.filter((id) => pagesRef.current.some((p) => p.id === id))
    if (targets.length === 0) return
    setJob({ active: true, kind: 'layout', current: 0, total: targets.length, stage: 'レイアウト認識', detail: 0, message: '' })
    for (let i = 0; i < targets.length; i++) {
      const id = targets[i]
      const page = pagesRef.current.find((p) => p.id === id)!
      const blob = getBlob(id)
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
  }, [detectLayout, updatePage, pagesRef, getBlob])

  // --- OCR 実行（必要なら先にレイアウト認識） ---
  const runOCR = useCallback(async (ids: string[]) => {
    const targets = ids.filter((id) => pagesRef.current.some((p) => p.id === id))
    if (targets.length === 0) return
    setJob({ active: true, kind: 'ocr', current: 0, total: targets.length, stage: 'OCR', detail: 0, message: '' })
    for (let i = 0; i < targets.length; i++) {
      const id = targets[i]
      let page = pagesRef.current.find((p) => p.id === id)!
      const blob = getBlob(id)
      if (!blob) continue
      setJob((j) => ({ ...j, current: i + 1, detail: 0, message: `${page.fileName}` }))
      const imageData = await decodeBlobToImageData(blob) // このループ反復のみ保持

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
      if (page.lines.length === 0) { updatePage(id, { status: 'ocr' }); continue }

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
  }, [detectLayout, recognizeLines, updatePage, pagesRef, getBlob])

  // ビューアと翻刻パネルの境界ドラッグ（右パネル幅を変更）
  const startSplitDrag = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    const onMove = (ev: PointerEvent) => setRightWidth(Math.max(280, Math.min(window.innerWidth - 420, window.innerWidth - ev.clientX)))
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
      <StatusBar modelState={modelState} lang={lang} />

      <main className="main">
        <PageSidebar
          pages={pages}
          selectedId={selectedId}
          lang={lang}
          isLoadingFiles={isLoadingFiles}
          canProcess={canProcess}
          anyUnprocessed={anyUnprocessed}
          ocrHint={ocrHint}
          ocrPagesCount={ocrPages.length}
          busy={busy}
          onAddImages={addImages}
          onPaste={handlePaste}
          onSelectPage={selectPage}
          onRemovePage={removePage}
          onLayoutAll={() => runLayout(pages.map((p) => p.id))}
          onOcrAll={() => runOCR(pages.map((p) => p.id))}
          onClearAll={handleClearAll}
          onBatchDownload={handleBatchDownload}
        />

        <section className="center">
          <Toolbar
            selectedPage={selectedPage}
            canProcess={canProcess}
            selectedNeedsLayout={selectedNeedsLayout}
            ocrHint={ocrHint}
            rightVisible={rightVisible}
            lang={lang}
            onLayout={() => selectedPage && runLayout([selectedPage.id])}
            onOcr={() => selectedPage && runOCR([selectedPage.id])}
            onToggleRight={() => setRightVisible((v) => !v)}
          />
          <JobBar job={job} isLoadingFiles={isLoadingFiles} fileLoadingState={fileLoadingState} lang={lang} />

          <div className={`viewer-wrap ${dragOver ? 'drag-over' : ''}`} {...dropProps}>
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
                <img className="placeholder-icon" src={`${import.meta.env.BASE_URL}soramaru/03_star.png`} alt="" />

                <p>{lang === 'ja' ? '画像をここにドラッグ&ドロップ、または左の「画像を追加」から読み込んでください' : 'Drag & drop images here, or use “Add images” on the left'}</p>
                <p className="placeholder-sub">{lang === 'ja' ? 'JPG / PNG / TIFF / HEIC / PDF・Ctrl+V で貼り付け可' : 'JPG / PNG / TIFF / HEIC / PDF · Ctrl+V to paste'}</p>
              </div>
            )}
            {dragOver && (
              <div className="drop-overlay">
                <div className="drop-overlay-inner">{lang === 'ja' ? '⬇ ドロップして画像を追加' : '⬇ Drop to add images'}</div>
              </div>
            )}
          </div>

          {selectedPage && selectedPage.status !== 'unprocessed' && (
            <ViewerBottomBar
              hasSelection={selectedOrder != null}
              lang={lang}
              onReorderLater={() => swapOrder('later')}
              onReorderEarlier={() => swapOrder('earlier')}
              onDelete={() => { if (selectedOrder != null) deleteLine(selectedOrder) }}
              onAddLine={addLine}
            />
          )}
        </section>

        {rightVisible && <div className="splitter" onPointerDown={startSplitDrag} title={lang === 'ja' ? 'ドラッグで幅を調整' : 'Drag to resize'} />}
        {rightVisible && (
          <aside className="right" style={{ flex: `0 0 ${rightWidth}px`, width: rightWidth }}>
            <ResultPanel
              item={selectedPage}
              selectedOrder={selectedOrder}
              onSelectLine={setSelectedOrder}
              onUpdateLineText={updateLineText}
              lang={lang}
            />
          </aside>
        )}
      </main>

      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          lang={lang}
          modelVersion={modelVersion}
          onChangeModelVersion={setModelVersion}
        />
      )}
    </div>
  )
}
