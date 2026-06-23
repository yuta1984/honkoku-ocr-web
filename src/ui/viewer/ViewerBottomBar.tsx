import type { Language } from '../../hooks/useLang'

interface ViewerBottomBarProps {
  hasSelection: boolean
  hasRegion: boolean      // 領域が選択されているか
  regionMode: boolean     // 領域ドロー中か
  lang: Language
  onReorderLater: () => void   // ← 読み順を後ろへ(+1)
  onReorderEarlier: () => void // → 読み順を前へ(-1)
  onDelete: () => void
  onAddLine: () => void
  onToggleRegion: () => void
}

/** 画像ビューア下部の行編集メニュー（読み順入替・削除・行追加・領域選択）＋操作ヒント */
export function ViewerBottomBar(p: ViewerBottomBarProps) {
  const { lang, hasSelection, hasRegion, regionMode } = p
  const ja = lang === 'ja'
  return (
    <div className="viewer-bottom">
      <span className="vb-label">{ja ? '読み順' : 'Order'}</span>
      <button
        className="btn-vb btn-vb-arrow"
        disabled={!hasSelection}
        title={ja ? '選択行を後ろへ（←キー）' : 'Move later (← key)'}
        onClick={p.onReorderLater}
      >←</button>
      <button
        className="btn-vb btn-vb-arrow"
        disabled={!hasSelection}
        title={ja ? '選択行を前へ（→キー）' : 'Move earlier (→ key)'}
        onClick={p.onReorderEarlier}
      >→</button>
      <span className="vb-sep" />
      <button
        className="btn-vb btn-vb-del"
        disabled={!hasSelection && !hasRegion}
        title={hasRegion
          ? (ja ? '選択領域と重なる行をすべて削除' : 'Delete all lines overlapping the region')
          : (ja ? '選択行を削除（Delete）' : 'Delete line (Delete)')}
        onClick={p.onDelete}
      >{hasRegion ? (ja ? '× 領域内の行を削除' : '× Delete in region') : (ja ? '× 行を削除' : '× Delete')}</button>
      <button
        className="btn-vb btn-vb-add"
        title={ja ? '新しい行を追加' : 'Add a line'}
        onClick={p.onAddLine}
      >{ja ? '＋ 行を追加' : '＋ Add line'}</button>
      <button
        className={`btn-vb btn-vb-region${regionMode ? ' active' : ''}${hasRegion && !regionMode ? ' has-region' : ''}`}
        title={ja
          ? '画像上をドラッグして範囲を選択。範囲内のみレイアウト認識／範囲内の行のみ削除できます'
          : 'Drag on the image to select an area; layout and delete then apply only inside it'}
        onClick={p.onToggleRegion}
      >{regionMode
        ? (ja ? '▱ 範囲をドラッグ…' : '▱ Drag to select…')
        : (ja ? '▱ 領域を選択' : '▱ Select region')}</button>
      <span className="vb-hint">
        {regionMode
          ? (ja ? '画像をドラッグして範囲を囲んでください（範囲外クリックで解除）' : 'Drag on the image to enclose an area (click outside to clear)')
          : (ja
            ? '行クリックで選択 → ドラッグ移動 / 四隅でリサイズ / × 削除 / ←→ 読み順入替'
            : 'Click a line → drag move / corners resize / × delete / ←→ reorder')}
      </span>
    </div>
  )
}
