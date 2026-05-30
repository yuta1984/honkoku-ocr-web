import { useEffect, useRef, useState } from 'react'
import type { PageItem, ImageStatus } from '../../types/ocr'
import type { Language } from '../../hooks/useLang'
import type { ExportFormat } from '../../lib/textExport'
import { DownloadMenu } from '../common/DownloadMenu'

const STATUS_LABEL: Record<ImageStatus, { ja: string; en: string; cls: string }> = {
  unprocessed: { ja: '未処理', en: 'Pending', cls: 'st-none' },
  layout: { ja: 'レイアウト認識済み', en: 'Layout', cls: 'st-layout' },
  ocr: { ja: 'OCR済み', en: 'Done', cls: 'st-ocr' },
}

const ACCEPT = 'image/jpeg,image/png,image/tiff,image/heic,image/heif,.tif,.tiff,.heic,.heif,application/pdf'

interface PageSidebarProps {
  pages: PageItem[]
  selectedId: string | null
  lang: Language
  isLoadingFiles: boolean
  canProcess: boolean
  anyUnprocessed: boolean
  ocrHint: string
  ocrPagesCount: number
  busy: boolean
  onAddImages: (files: File[]) => void
  onPaste: () => void
  onSelectPage: (id: string) => void
  onRemovePage: (id: string) => void
  onLayoutAll: () => void
  onOcrAll: () => void
  onClearAll: () => void
  onBatchDownload: (fmt: ExportFormat) => void
}

export function PageSidebar(p: PageSidebarProps) {
  const { lang } = p
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

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

  return (
    <aside className="sidebar">
      <div className="sidebar-actions">
        <button className="btn btn-primary btn-block" onClick={() => fileInputRef.current?.click()} disabled={p.isLoadingFiles}>
          {lang === 'ja' ? '＋ 画像を追加' : '＋ Add images'}
        </button>
        <button className="btn btn-secondary btn-block" onClick={p.onPaste} disabled={p.isLoadingFiles}>
          {lang === 'ja' ? 'クリップボードから貼り付け' : 'Paste from clipboard'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPT}
          onChange={(e) => { if (e.target.files) p.onAddImages(Array.from(e.target.files)); e.target.value = '' }}
          style={{ display: 'none' }}
        />
      </div>

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
