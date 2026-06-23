import { useState, useCallback, useEffect, useRef } from 'react'
import type { JobProgress } from './types/ocr'
import { useLang } from './hooks/useLang'
import { useFileDrop } from './hooks/useFileDrop'
import { useMediaQuery } from './hooks/useMediaQuery'
import { useModelVersion } from './hooks/useModelVersion'
import { useLayoutVersion } from './hooks/useLayoutVersion'
import { useShowGuide } from './hooks/useShowGuide'
import { useLlmSettings } from './hooks/useLlmSettings'
import { useOCRWorker } from './hooks/useOCRWorker'
import { usePageStore } from './hooks/usePageStore'
import { Header } from './ui/layout/Header'
import { StatusBar } from './ui/StatusBar'
import { JobBar } from './ui/JobBar'
import { PageSidebar } from './ui/sidebar/PageSidebar'
import { Toolbar } from './ui/toolbar/Toolbar'
import { ViewerBottomBar } from './ui/viewer/ViewerBottomBar'
import { ImageViewer, type ImageViewerHandle } from './ui/viewer/ImageViewer'
import { ResultPanel } from './ui/results/ResultPanel'
import { SettingsModal } from './ui/settings/SettingsModal'
import { ImageSourcePicker } from './ui/mobile/ImageSourcePicker'
import { processingGuide } from './lib/processing-guide'
import { decodeBlobToImageData } from './lib/imageLoader'
import { rectsOverlap } from './lib/geometry'
import type { BoundingBox } from './types/ocr'
import { downloadPages, type ExportFormat } from './lib/textExport'
import './styles/app.css'

const idleJob: JobProgress = { active: false, kind: null, current: 0, total: 0, stage: '', detail: 0, message: '' }
const FILE_ACCEPT_ALL = 'image/jpeg,image/png,image/tiff,image/heic,image/heif,.tif,.tiff,.heic,.heif,application/pdf'

export default function App() {
  const { lang, toggleLanguage } = useLang()
  const isMobile = useMediaQuery('(max-width: 768px)')
  const { modelVersion, setModelVersion } = useModelVersion()
  const { layoutVersion, setLayoutVersion } = useLayoutVersion()
  const { showGuide, setShowGuide } = useShowGuide()
  const llm = useLlmSettings()
  const { isReady, modelState, detectLayout, recognizeLines } = useOCRWorker(modelVersion, layoutVersion)
  const store = usePageStore()
  const {
    pages, selectedId, selectedPage, selectedOrder, setSelectedOrder, selectedDataUrl,
    isLoadingFiles, fileLoadingState, pagesRef, getBlob,
    addImages, handlePaste, selectPage, clearAll, removePage, updatePage, updateLine, updateLineText, deleteLine,
    deleteLinesInRegion, swapOrder, addLine,
  } = store

  const [job, setJob] = useState<JobProgress>(idleJob)
  const [showSettings, setShowSettings] = useState(false)
  const [rightWidth, setRightWidth] = useState(480)
  const [rightVisible, setRightVisible] = useState(true)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [mobileTab, setMobileTab] = useState<'viewer' | 'result'>('viewer')
  const [showSourcePicker, setShowSourcePicker] = useState(false)
  // 領域選択（範囲指定レイアウト/削除）
  const [selectedRegion, setSelectedRegion] = useState<BoundingBox | null>(null)
  const [regionMode, setRegionMode] = useState(false)
  const sourceInputRef = useRef<HTMLInputElement>(null)
  const imageViewerRef = useRef<ImageViewerHandle | null>(null)
  const { dragOver, dropProps } = useFileDrop(addImages)

  // 領域がドローされたら確定し、ドローモードを抜ける（null=解除）
  const handleRegionDraw = useCallback((b: BoundingBox | null) => {
    setSelectedRegion(b)
    setRegionMode(false)
  }, [])

  // 画像を切り替えたら領域選択をリセット
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setSelectedRegion(null)
    setRegionMode(false)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [selectedId])

  // 「行を追加」時は ImageViewer から現在の可視領域を取得して addLine に渡す。
  // これにより、ズームインしている領域の中央に新規 bbox が置かれる。
  const handleAddLine = useCallback(() => {
    addLine(imageViewerRef.current?.getVisibleImageBounds() ?? undefined)
  }, [addLine])

  const handleClearAll = useCallback(() => { clearAll(); setJob(idleJob) }, [clearAll])

  // モバイル: 画像追加時はビューアタブへ自動切替 + drawer を閉じる
  useEffect(() => {
    if (!isMobile) return
    if (selectedId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMobileTab('viewer')
      setMobileSidebarOpen(false)
    }
  }, [selectedId, isMobile])

  // モバイル ↔ デスクトップ切替時に drawer を閉じる
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (!isMobile) setMobileSidebarOpen(false) }, [isMobile])

  // モバイル: OCR ジョブが「実行中→完了」へ遷移した瞬間に翻刻タブへ自動切替
  // runOCR の closure 内で setMobileTab を呼ぶ方式は iOS で確実に効かなかったため、
  // 観測可能な job.active の transition を見る reactive な方式に置き換える。
  const wasOcrActiveRef = useRef(false)
  useEffect(() => {
    const isOcrActive = job.active && job.kind === 'ocr'
    const justFinished = wasOcrActiveRef.current && !isOcrActive
    wasOcrActiveRef.current = isOcrActive
    if (justFinished && isMobile) setMobileTab('result')
  }, [job.active, job.kind, isMobile])

  // --- レイアウト認識 ---
  // region 指定時は単一ページの選択領域のみ再検出し、領域外の既存行/領域は温存する。
  const runLayout = useCallback(async (ids: string[], region?: BoundingBox) => {
    const targets = ids.filter((id) => pagesRef.current.some((p) => p.id === id))
    if (targets.length === 0) return
    const useRegion = region && targets.length === 1
    setJob({ active: true, kind: 'layout', current: 0, total: targets.length, stage: 'レイアウト認識', detail: 0, message: '' })
    for (let i = 0; i < targets.length; i++) {
      const id = targets[i]
      const page = pagesRef.current.find((p) => p.id === id)!
      const blob = getBlob(id)
      if (!blob) continue
      setJob((j) => ({ ...j, current: i + 1, detail: 0, message: `${page.fileName} を解析中...` }))
      try {
        const imageData = await decodeBlobToImageData(blob)
        const { lines, regions } = useRegion
          ? await detectLayout(imageData, {
              region,
              mergeLines: page.lines.filter((l) => !rectsOverlap(l, region)),
              mergeRegions: page.regions.filter((r) => !rectsOverlap(r, region)),
            })
          : await detectLayout(imageData)
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
      const imageData = await decodeBlobToImageData(blob)

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

  // ビューアと翻刻パネルの境界ドラッグ（デスクトップ専用）
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

  // 画像ソース選択（モバイル）: 隠し input の accept/capture を切替えて click
  const handleSourceSelect = useCallback((kind: 'camera' | 'library' | 'file') => {
    const input = sourceInputRef.current
    if (!input) return
    if (kind === 'camera') {
      input.accept = 'image/*'
      input.setAttribute('capture', 'environment')
    } else if (kind === 'library') {
      input.accept = 'image/*'
      input.removeAttribute('capture')
    } else {
      input.accept = FILE_ACCEPT_ALL
      input.removeAttribute('capture')
    }
    setShowSourcePicker(false)
    input.click()
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

  // モバイル: 翻刻パネルは常時マウント(タブで表示切替)。デスクトップは rightVisible に従う
  const showRight = isMobile ? true : rightVisible
  const rightStyle = isMobile ? undefined : { flex: `0 0 ${rightWidth}px`, width: rightWidth }
  const mainClass = `main${isMobile ? ` mobile mobile-tab-${mobileTab}` : ''}`

  return (
    <div className="app">
      <Header
        lang={lang}
        onToggleLanguage={toggleLanguage}
        onOpenSettings={() => setShowSettings(true)}
        onMenuToggle={() => setMobileSidebarOpen((v) => !v)}
        onLogoClick={handleClearAll}
      />
      <StatusBar modelState={modelState} lang={lang} />

      {isMobile && (
        <div className="mobile-tabs" role="tablist">
          <button
            role="tab"
            aria-selected={mobileTab === 'viewer'}
            className={`mobile-tab ${mobileTab === 'viewer' ? 'active' : ''}`}
            onClick={() => setMobileTab('viewer')}
          >
            {lang === 'ja' ? '📷 ビューア' : '📷 Viewer'}
          </button>
          <button
            role="tab"
            aria-selected={mobileTab === 'result'}
            className={`mobile-tab ${mobileTab === 'result' ? 'active' : ''}`}
            onClick={() => setMobileTab('result')}
          >
            {lang === 'ja' ? '📜 翻刻' : '📜 Transcription'}
          </button>
        </div>
      )}

      <main className={mainClass}>
        {isMobile && mobileSidebarOpen && (
          <div className="sidebar-backdrop" onClick={() => setMobileSidebarOpen(false)} />
        )}
        <PageSidebar
          pages={pages}
          selectedPage={selectedPage}
          selectedId={selectedId}
          selectedNeedsLayout={selectedNeedsLayout}
          lang={lang}
          isLoadingFiles={isLoadingFiles}
          canProcess={canProcess}
          anyUnprocessed={anyUnprocessed}
          ocrHint={ocrHint}
          ocrPagesCount={ocrPages.length}
          busy={busy}
          isOpen={mobileSidebarOpen}
          isMobile={isMobile}
          onClose={() => setMobileSidebarOpen(false)}
          onAddImages={addImages}
          onPaste={handlePaste}
          onSelectPage={selectPage}
          onRemovePage={removePage}
          onLayout={() => selectedPage && runLayout([selectedPage.id])}
          onOcr={() => selectedPage && runOCR([selectedPage.id])}
          onLayoutAll={() => runLayout(pages.map((p) => p.id))}
          onOcrAll={() => runOCR(pages.map((p) => p.id))}
          onClearAll={handleClearAll}
          onBatchDownload={handleBatchDownload}
        />

        <section className="center">
          {isMobile ? (
            <Toolbar
              selectedPage={selectedPage}
              canProcess={canProcess}
              selectedNeedsLayout={selectedNeedsLayout}
              ocrHint={ocrHint}
              lang={lang}
              showGuide={showGuide}
              onLayout={() => selectedPage && runLayout([selectedPage.id], selectedRegion ?? undefined)}
              onOcr={() => selectedPage && runOCR([selectedPage.id])}
              onDismissGuide={() => setShowGuide(false)}
            />
          ) : (
            (() => {
              if (!showGuide) return null
              const guide = processingGuide(selectedPage, lang)
              if (!guide) return null
              return (
                <div className="toolbar-guide">
                  <span className="toolbar-guide-text">{guide}</span>
                  <button
                    className="toolbar-guide-dismiss"
                    onClick={() => setShowGuide(false)}
                    title={lang === 'ja' ? 'ガイドを非表示（設定でいつでも復活できます）' : 'Hide guide (re-enable in Settings)'}
                    aria-label={lang === 'ja' ? 'ガイドを非表示' : 'Dismiss guide'}
                  >
                    ✕
                  </button>
                </div>
              )
            })()
          )}
          <JobBar job={job} isLoadingFiles={isLoadingFiles} fileLoadingState={fileLoadingState} lang={lang} />

          <div
            className={`viewer-wrap ${dragOver ? 'drag-over' : ''}`}
            {...dropProps}
            onClick={(e) => {
              // モバイル: 画像未読み込み時に placeholder タップで画像ソース選択
              if (!isMobile || selectedPage) return
              if ((e.target as HTMLElement).closest('.viewer-placeholder')) {
                setShowSourcePicker(true)
              }
            }}
          >
            {selectedPage ? (
              <ImageViewer
                ref={imageViewerRef}
                key={selectedPage.id}
                dataUrl={selectedDataUrl}
                lines={selectedPage.lines}
                regions={selectedPage.regions}
                showOverlays={selectedPage.status !== 'unprocessed'}
                selectedOrder={selectedOrder}
                onSelectLine={setSelectedOrder}
                onUpdateLine={updateLine}
                onDeleteLine={deleteLine}
                regionMode={regionMode}
                selectedRegion={selectedRegion}
                onRegionDraw={handleRegionDraw}
              />
            ) : (
              <div className="viewer-placeholder">
                <img className="placeholder-icon" src={`${import.meta.env.BASE_URL}soramaru/03_star.png`} alt="" />

                <p>
                  {isMobile
                    ? (lang === 'ja' ? '① タップして画像を追加（カメラ・ライブラリ・ファイル）' : '① Tap to add image (camera / library / file)')
                    : (lang === 'ja' ? '① 画像をここにドラッグ&ドロップ、または左の「画像を追加」から読み込んでください' : '① Drag & drop images here, or use “Add images” on the left')}
                </p>
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
              hasRegion={selectedRegion != null}
              regionMode={regionMode}
              lang={lang}
              onReorderLater={() => swapOrder('later')}
              onReorderEarlier={() => swapOrder('earlier')}
              onDelete={() => {
                if (selectedRegion) deleteLinesInRegion(selectedRegion)
                else if (selectedOrder != null) deleteLine(selectedOrder)
              }}
              onAddLine={handleAddLine}
              onToggleRegion={() => setRegionMode((m) => !m)}
            />
          )}
        </section>

        {showRight && !isMobile && (
          <div className="splitter" onPointerDown={startSplitDrag} title={lang === 'ja' ? 'ドラッグで幅を調整' : 'Drag to resize'} />
        )}
        {showRight && (
          <aside className="right" style={rightStyle}>
            <ResultPanel
              item={selectedPage}
              selectedOrder={selectedOrder}
              onSelectLine={setSelectedOrder}
              onUpdateLineText={updateLineText}
              lang={lang}
              llm={llm}
              onHide={isMobile ? undefined : () => setRightVisible(false)}
              onOpenSettings={() => setShowSettings(true)}
            />
          </aside>
        )}
        {!isMobile && !rightVisible && (
          <button
            className="show-right-strip"
            onClick={() => setRightVisible(true)}
            title={lang === 'ja' ? '翻刻パネルを表示' : 'Show transcription panel'}
            aria-label={lang === 'ja' ? '翻刻パネルを表示' : 'Show panel'}
          >
            ◀
          </button>
        )}
      </main>

      {/* モバイル: 画像ソース選択 bottom sheet + 隠し input */}
      {showSourcePicker && (
        <ImageSourcePicker
          lang={lang}
          onSelect={handleSourceSelect}
          onClose={() => setShowSourcePicker(false)}
        />
      )}
      <input
        ref={sourceInputRef}
        type="file"
        multiple
        accept={FILE_ACCEPT_ALL}
        onChange={(e) => {
          if (e.target.files) addImages(Array.from(e.target.files))
          e.target.value = ''
        }}
        style={{ display: 'none' }}
      />

      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          lang={lang}
          modelVersion={modelVersion}
          onChangeModelVersion={setModelVersion}
          layoutVersion={layoutVersion}
          onChangeLayoutVersion={setLayoutVersion}
          showGuide={showGuide}
          onChangeShowGuide={setShowGuide}
          llm={llm}
        />
      )}
    </div>
  )
}
