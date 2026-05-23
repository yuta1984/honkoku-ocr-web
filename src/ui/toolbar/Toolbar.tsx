import type { PageItem } from '../../types/ocr'
import type { Language } from '../../hooks/useLang'

interface ToolbarProps {
  selectedPage: PageItem | null
  canProcess: boolean
  selectedNeedsLayout: boolean
  ocrHint: string
  rightVisible: boolean
  lang: Language
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
        <button className="btn btn-secondary btn-sm" onClick={p.onToggleRight}>
          {p.rightVisible
            ? (lang === 'ja' ? '翻刻パネルを隠す ▶' : 'Hide panel ▶')
            : (lang === 'ja' ? '◀ 翻刻パネルを表示' : '◀ Show panel')}
        </button>
      </div>
    </div>
  )
}
