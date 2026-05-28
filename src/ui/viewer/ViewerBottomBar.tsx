import type { Language } from '../../hooks/useLang'

interface ViewerBottomBarProps {
  hasSelection: boolean
  lang: Language
  onReorderLater: () => void   // ← 読み順を後ろへ(+1)
  onReorderEarlier: () => void // → 読み順を前へ(-1)
  onDelete: () => void
  onAddLine: () => void
}

/** 画像ビューア下部の行編集メニュー（読み順入替・削除・行追加）＋操作ヒント */
export function ViewerBottomBar(p: ViewerBottomBarProps) {
  const { lang, hasSelection } = p
  return (
    <div className="viewer-bottom">
      <span className="vb-label">{lang === 'ja' ? '読み順' : 'Order'}</span>
      <button
        className="btn-vb btn-vb-arrow"
        disabled={!hasSelection}
        title={lang === 'ja' ? '選択行を後ろへ（←キー）' : 'Move later (← key)'}
        onClick={p.onReorderLater}
      >←</button>
      <button
        className="btn-vb btn-vb-arrow"
        disabled={!hasSelection}
        title={lang === 'ja' ? '選択行を前へ（→キー）' : 'Move earlier (→ key)'}
        onClick={p.onReorderEarlier}
      >→</button>
      <span className="vb-sep" />
      <button
        className="btn-vb btn-vb-del"
        disabled={!hasSelection}
        title={lang === 'ja' ? '選択行を削除（Delete）' : 'Delete line (Delete)'}
        onClick={p.onDelete}
      >{lang === 'ja' ? '× 行を削除' : '× Delete'}</button>
      <button
        className="btn-vb btn-vb-add"
        title={lang === 'ja' ? '新しい行を追加' : 'Add a line'}
        onClick={p.onAddLine}
      >{lang === 'ja' ? '＋ 行を追加' : '＋ Add line'}</button>
      <span className="vb-hint">
        {lang === 'ja'
          ? '行クリックで選択 → ドラッグ移動 / 四隅でリサイズ / × 削除 / ←→ 読み順入替'
          : 'Click a line → drag move / corners resize / × delete / ←→ reorder'}
      </span>
    </div>
  )
}
