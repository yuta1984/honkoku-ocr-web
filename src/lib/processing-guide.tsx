import type { PageItem } from '../types/ocr'
import type { Language } from '../hooks/useLang'

/**
 * 現在の状態に応じた処理ガイドメッセージ。Toolbar(モバイル)とサイドバー(PC)で共用。
 * OCR 済みの場合は完了メッセージ。それ以外は次の手順を促すヒント。
 */
export function processingGuide(selectedPage: PageItem | null, lang: Language): React.ReactNode {
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
      ? (<>OCR処理が完了しました！「<strong>翻刻</strong>」パネルで確認・編集できます。ふりがなや訓点は「みんなで翻刻記法」で出力されます。</>)
      : (<>OCR finished! Review and edit the result in the <strong>Transcription</strong> panel. Furigana and kunten are output in <em>Minna de Honkoku notation</em>.</>)
  }
  return null
}
