import { useEffect, useRef, useState } from 'react'
import type { PageItem, ImageStatus } from '../../types/ocr'
import type { Language } from '../../hooks/useLang'
import type { ExportFormat } from '../../lib/textExport'
import { DownloadMenu } from '../common/DownloadMenu'
import { CameraCapture } from '../camera/CameraCapture'
import { IiifImportModal } from '../iiif/IiifImportModal'

const STATUS_LABEL: Record<ImageStatus, { ja: string; en: string; cls: string }> = {
  unprocessed: { ja: '未処理', en: 'Pending', cls: 'st-none' },
  layout: { ja: 'レイアウト認識済み', en: 'Layout', cls: 'st-layout' },
  ocr: { ja: 'OCR済み', en: 'Done', cls: 'st-ocr' },
}

const ACCEPT = 'image/jpeg,image/png,image/tiff,image/heic,image/heif,.tif,.tiff,.heic,.heif,application/pdf'

// R2 honkoku-ocr/samples/ にホストしたサンプル画像。ボタン押下時にランダムに 1 枚追加。
const SAMPLE_BASE = 'https://pub-1b00c465f60640a3bf9b7b7d329d06cc.r2.dev/samples'
const SAMPLE_FILES = [
  '4F822CFAD188526AD31AF4804FBFBF0E_002.jpg',
  '777f243e4cecb84536467e5218be681b_002.jpg',
  'f7a72665bc6bc8e4ee7a2210978c7d87_010.jpg',
]

interface PageSidebarProps {
  pages: PageItem[]
  selectedPage: PageItem | null
  selectedId: string | null
  selectedNeedsLayout: boolean
  lang: Language
  isLoadingFiles: boolean
  canProcess: boolean
  anyUnprocessed: boolean
  ocrHint: string
  ocrPagesCount: number
  busy: boolean
  isOpen: boolean       // モバイル drawer 用
  isMobile: boolean
  onClose: () => void   // モバイル drawer の close
  onAddImages: (files: File[]) => void
  onPaste: () => void
  onSelectPage: (id: string) => void
  onRemovePage: (id: string) => void
  onLayout: () => void  // PC 用: 単一画像のレイアウト認識
  onOcr: () => void     // PC 用: 単一画像の OCR 実行
  onLayoutAll: () => void
  onOcrAll: () => void
  onClearAll: () => void
  onBatchDownload: (fmt: ExportFormat) => void
}

export function PageSidebar(p: PageSidebarProps) {
  const { lang } = p
  const base = import.meta.env.BASE_URL
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  // モバイル: drawer の開閉状態にアクセシビリティ属性を反映する
  const ariaHidden = p.isMobile && !p.isOpen
  const [loadingSample, setLoadingSample] = useState(false)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [iiifOpen, setIiifOpen] = useState(false)
  // SAMPLE_FILES を順番にローテーション。末尾まで行ったら 0 に戻る。
  const [sampleIndex, setSampleIndex] = useState(0)

  // サンプル画像 (R2) を 1 枚順番に fetch して addImages に流す
  const handleLoadSample = async () => {
    const idx = sampleIndex
    const name = SAMPLE_FILES[idx]
    setSampleIndex((idx + 1) % SAMPLE_FILES.length)
    setLoadingSample(true)
    try {
      const res = await fetch(`${SAMPLE_BASE}/${name}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      const file = new File([blob], name, { type: blob.type || 'image/jpeg' })
      p.onAddImages([file])
    } catch (e) {
      console.error('sample fetch failed:', e)
      alert(lang === 'ja' ? 'サンプルの読み込みに失敗しました' : 'Failed to load sample')
    } finally {
      setLoadingSample(false)
    }
  }

  // 外側クリック / Esc でメニューを閉じる
  useEffect(() => {
    if (menuOpenId == null) return
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpenId(null)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpenId(null) }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpenId])

  const sidebarClass = `sidebar${p.isMobile ? ' sidebar-drawer' : ''}${p.isOpen ? ' is-open' : ''}`
  return (
    <aside className={sidebarClass} aria-hidden={ariaHidden}>
      {p.isMobile && (
        <div className="sidebar-drawer-header">
          <span className="sidebar-drawer-title">{lang === 'ja' ? '画像一覧' : 'Images'}</span>
          <button className="btn-close" onClick={p.onClose} aria-label={lang === 'ja' ? '閉じる' : 'Close'}>✕</button>
        </div>
      )}
      <div className="sidebar-actions">
        <div className="sidebar-step-title">
          {lang === 'ja' ? '① 画像を追加する' : '① Add images'}
        </div>
        <button className="btn btn-primary btn-block" onClick={() => fileInputRef.current?.click()} disabled={p.isLoadingFiles}>
          {lang === 'ja' ? '＋ 画像を追加' : '＋ Add images'}
        </button>
        <button className="btn btn-secondary btn-block" onClick={p.onPaste} disabled={p.isLoadingFiles}>
          {lang === 'ja' ? 'クリップボードから貼り付け' : 'Paste from clipboard'}
        </button>
        <button className="btn btn-secondary btn-block" onClick={() => setIiifOpen(true)} disabled={p.isLoadingFiles}>
          {lang === 'ja' ? 'IIIFマニフェストを指定' : 'Import from IIIF'}
        </button>
        {!p.isMobile && (
          <button className="btn btn-secondary btn-block" onClick={() => setCameraOpen(true)} disabled={p.isLoadingFiles}>
            {lang === 'ja' ? '📷 カメラで撮影' : '📷 Take a photo'}
          </button>
        )}
        <button
          className="btn btn-secondary btn-block"
          onClick={handleLoadSample}
          disabled={p.isLoadingFiles || loadingSample}
        >
          {loadingSample
            ? (lang === 'ja' ? 'サンプルを読み込み中...' : 'Loading sample...')
            : (lang === 'ja' ? 'サンプルを追加' : 'Add sample')}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPT}
          onChange={(e) => { if (e.target.files) p.onAddImages(Array.from(e.target.files)); e.target.value = '' }}
          style={{ display: 'none' }}
        />
        {cameraOpen && (
          <CameraCapture
            lang={lang}
            onCapture={(file) => p.onAddImages([file])}
            onClose={() => setCameraOpen(false)}
          />
        )}
        {iiifOpen && (
          <IiifImportModal
            lang={lang}
            onAddImages={p.onAddImages}
            onClose={() => setIiifOpen(false)}
          />
        )}
      </div>

      {!p.isMobile && (
        <div className="sidebar-processing">
          <button
            className="btn btn-primary btn-block"
            disabled={!p.canProcess || !p.selectedPage}
            onClick={p.onLayout}
          >
            {lang === 'ja' ? '② レイアウト認識' : '② Layout'}
          </button>
          <button
            className="btn btn-primary btn-block"
            disabled={!p.canProcess || p.selectedNeedsLayout}
            title={p.selectedNeedsLayout && p.selectedPage ? p.ocrHint : undefined}
            onClick={p.onOcr}
          >
            {lang === 'ja' ? '③ OCR実行' : '③ OCR'}
          </button>
        </div>
      )}

      <div className="sidebar-list">
        {p.pages.length === 0 && (
          <p className="sidebar-empty">{lang === 'ja' ? '画像が追加されていません' : 'No images yet'}</p>
        )}
        {p.pages.map((page) => {
          const st = STATUS_LABEL[page.status]
          const name = page.pageIndex ? `${page.fileName} (p.${page.pageIndex})` : page.fileName
          const isMenuOpen = menuOpenId === page.id
          return (
            <div
              key={page.id}
              className={`sidebar-item ${page.id === p.selectedId ? 'active' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => p.onSelectPage(page.id)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); p.onSelectPage(page.id) } }}
              title={name}
            >
              <span className="sidebar-index">{page.index}</span>
              <img className="sidebar-thumb" src={page.thumbnailDataUrl} alt={page.fileName} />
              <span className="sidebar-meta">
                <span className="sidebar-name">{name}</span>
                <span className={`status-badge ${st.cls}`}>{lang === 'ja' ? st.ja : st.en}</span>
              </span>
              <div className="sidebar-menu" ref={isMenuOpen ? menuRef : undefined}>
                <button
                  className="sidebar-menu-btn"
                  onClick={(e) => { e.stopPropagation(); setMenuOpenId(isMenuOpen ? null : page.id) }}
                  aria-label={lang === 'ja' ? 'メニュー' : 'menu'}
                  title={lang === 'ja' ? 'メニュー' : 'Menu'}
                >⋯</button>
                {isMenuOpen && (
                  <div className="sidebar-menu-list" onClick={(e) => e.stopPropagation()}>
                    <button
                      className="sidebar-menu-item danger"
                      onClick={() => { setMenuOpenId(null); p.onRemovePage(page.id) }}
                    >
                      {lang === 'ja' ? '削除' : 'Delete'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {p.isMobile && (
        <div className="sidebar-mobile-links">
          <a href={`${base}about.html`} target="_blank" rel="noopener noreferrer">
            {lang === 'ja' ? '本アプリについて' : 'About'}
          </a>
          <a href={`${base}tech.html`} target="_blank" rel="noopener noreferrer">
            {lang === 'ja' ? '技術情報' : 'Technical Details'}
          </a>
          <a href="https://honkoku.org/" target="_blank" rel="noopener noreferrer">
            {lang === 'ja' ? 'みんなで翻刻' : 'Minna de Honkoku'}
          </a>
        </div>
      )}

      {p.pages.length > 0 && (
        <div className="sidebar-batch">
          <div className="sidebar-batch-title">{lang === 'ja' ? '一括処理' : 'Batch'}</div>
          <button className="btn btn-outline btn-block" disabled={!p.canProcess} onClick={p.onLayoutAll}>
            {lang === 'ja' ? '全画像レイアウト認識' : 'Layout all'}
          </button>
          <button
            className="btn btn-outline btn-block"
            disabled={!p.canProcess || p.anyUnprocessed}
            title={p.anyUnprocessed ? p.ocrHint : undefined}
            onClick={p.onOcrAll}
          >
            {lang === 'ja' ? '全画像OCR実行' : 'OCR all'}
          </button>
          <DownloadMenu
            label={lang === 'ja' ? '認識テキストを保存' : 'Download text'}
            block
            disabled={p.ocrPagesCount === 0}
            onSelect={p.onBatchDownload}
          />
          <button className="btn btn-text btn-block" disabled={p.busy} onClick={p.onClearAll}>
            {lang === 'ja' ? 'すべてクリア' : 'Clear all'}
          </button>
        </div>
      )}
    </aside>
  )
}
