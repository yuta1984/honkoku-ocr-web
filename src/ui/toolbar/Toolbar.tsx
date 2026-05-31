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

// 現在の状態に応じたガイド文。OCR 済みでは表示しない（null）。
function guideMessage(selectedPage: PageItem | null, lang: Language): React.ReactNode {
  const ja = lang === 'ja'
  if (!selectedPage) {
    return ja
      ? (<>まずはOCR（文字認識）する<strong>画像を追加</strong>しましょう（複数選択可）</>)
      : (<>Start by <strong>adding an image</strong> to OCR (multiple files supported).</>)
  }
  if (selectedPage.status === 'unprocessed') {
    return ja
      ? (<>次に<strong>レイアウト認識</strong>を実行して行の位置を認識しましょう</>)
      : (<>Next, run <strong>Layout</strong> to detect line positions.</>)
  }
  if (selectedPage.status === 'layout') {
    return ja
      ? (<>レイアウト認識が完了しました！行を移動・追加・削除して調整しましょう。行を選択して左右キーで読み順も入替え可能です。準備ができたら「<strong>OCR実行</strong>」</>)
      : (<>Layout detection complete! Move, add, or delete lines as needed. Select a line and use ←/→ keys to swap reading order. When ready, click <strong>OCR</strong>.</>)
  }
  if (selectedPage.status === 'ocr') {
    return ja
      ? (<>OCR処理が完了しました！「<strong>翻刻</strong>」パネルで確認・編集できます</>)
      : (<>OCR finished! Review and edit the result in the <strong>Transcription</strong> panel.</>)
  }
  return null
}

export function Toolbar(p: ToolbarProps) {
  const { lang, selectedPage } = p
  const guide = guideMessage(selectedPage, lang)
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
      {guide && <div className="toolbar-guide">{guide}</div>}
    </div>
  )
}
