interface ImageSourcePickerProps {
  lang: 'ja' | 'en'
  onSelect: (kind: 'camera' | 'library' | 'file') => void
  onClose: () => void
}

export function ImageSourcePicker({ lang, onSelect, onClose }: ImageSourcePickerProps) {
  const t = lang === 'ja'
  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="sheet-title">{t ? '画像を追加' : 'Add image'}</div>
        <button className="sheet-item" onClick={() => onSelect('camera')}>
          <span className="sheet-icon">📷</span>
          {t ? '写真を撮る' : 'Take photo'}
        </button>
        <button className="sheet-item" onClick={() => onSelect('library')}>
          <span className="sheet-icon">🖼️</span>
          {t ? '写真ライブラリから選択' : 'Choose from library'}
        </button>
        <button className="sheet-item" onClick={() => onSelect('file')}>
          <span className="sheet-icon">📁</span>
          {t ? 'ファイルから選択（PDFなど）' : 'Choose file (PDF etc.)'}
        </button>
        <button className="sheet-item sheet-cancel" onClick={onClose}>
          {t ? 'キャンセル' : 'Cancel'}
        </button>
      </div>
    </div>
  )
}
