import type { PageItem } from '../../types/ocr'
import type { Language } from '../../hooks/useLang'

interface ToolbarProps {
  selectedPage: PageItem | null
  canProcess: boolean
  selectedNeedsLayout: boolean
  ocrHint: string
  rightVisible: boolean
  lang: Language
  isMobile: boolean
  onLayout: () => void
  onOcr: () => void
  onToggleRight: () => void
}

export function Toolbar(p: ToolbarProps) {
  const { lang, selectedPage } = p
  return (
    <div className="toolbar">
      <div className="toolbar-left">
        <button className="btn btn-primary" disabled={!p.canProcess || !selectedPage} onClick={p.onLayout}>
          {lang === 'ja' ? 'レイアウト認識' : 'Layout'}
        </button>
        <button
          className="btn btn-primary"
          disabled={!p.canProcess || p.selectedNeedsLayout}
          title={p.selectedNeedsLayout && selectedPage ? p.ocrHint : undefined}
          onClick={p.onOcr}
        >
          {lang === 'ja' ? 'OCR実行' : 'OCR'}
        </button>
      </div>
      <div className="toolbar-right">
        {selectedPage && selectedPage.lines.length > 0 && (
          <span className="toolbar-info">
            {selectedPage.lines.length} {lang === 'ja' ? '行' : 'lines'}
          </span>
        )}
        {!p.isMobile && (
          <button className="btn btn-secondary btn-sm" onClick={p.onToggleRight}>
            {p.rightVisible
              ? (lang === 'ja' ? '翻刻パネルを隠す ▶' : 'Hide panel ▶')
              : (lang === 'ja' ? '◀ 翻刻パネルを表示' : '◀ Show panel')}
          </button>
        )}
      </div>
    </div>
  )
}
