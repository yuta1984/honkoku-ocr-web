import type { PageItem } from '../../types/ocr'
import type { Language } from '../../hooks/useLang'
import { processingGuide } from '../../lib/processing-guide'

interface ToolbarProps {
  selectedPage: PageItem | null
  canProcess: boolean
  selectedNeedsLayout: boolean
  ocrHint: string
  lang: Language
  showGuide: boolean
  onLayout: () => void
  onOcr: () => void
  onDismissGuide: () => void
}

/** モバイル時のみ表示する処理ツールバー（②③ボタン + ガイド）。 */
export function Toolbar(p: ToolbarProps) {
  const { lang, selectedPage } = p
  const guide = p.showGuide ? processingGuide(selectedPage, lang) : null
  return (
    <div className="toolbar-container">
      <div className="toolbar">
        <div className="toolbar-left">
          <button className="btn btn-primary" disabled={!p.canProcess || !selectedPage} onClick={p.onLayout}>
            {lang === 'ja' ? '② レイアウト認識' : '② Layout'}
          </button>
          <button
            className="btn btn-primary"
            disabled={!p.canProcess || p.selectedNeedsLayout}
            title={p.selectedNeedsLayout && selectedPage ? p.ocrHint : undefined}
            onClick={p.onOcr}
          >
            {lang === 'ja' ? '③ OCR実行' : '③ OCR'}
          </button>
        </div>
      </div>
      {guide && (
        <div className="toolbar-guide">
          <span className="toolbar-guide-text">{guide}</span>
          <button
            className="toolbar-guide-dismiss"
            onClick={p.onDismissGuide}
            title={lang === 'ja' ? 'ガイドを非表示（設定でいつでも復活できます）' : 'Hide guide (re-enable in Settings)'}
            aria-label={lang === 'ja' ? 'ガイドを非表示' : 'Dismiss guide'}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  )
}
