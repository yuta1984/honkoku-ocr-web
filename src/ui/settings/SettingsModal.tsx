import { useState } from 'react'
import { clearModelCache } from '../../ocr/model-loader'
import type { OcrModelVersion } from '../../ocr/model-loader'

interface SettingsModalProps {
  onClose: () => void
  lang: 'ja' | 'en'
  modelVersion: OcrModelVersion
  onChangeModelVersion: (next: OcrModelVersion) => void
}

const OCR_VERSIONS: { value: OcrModelVersion; label: string; descJa: string; descEn: string }[] = [
  { value: 'v8', label: 'v8', descJa: 'ConvNeXt-Base。低解像度に強く精度も最良（推奨）', descEn: 'ConvNeXt-Base. Robust to low resolution, best accuracy (recommended)' },
  { value: 'v7', label: 'v7', descJa: 'ConvNeXt-Small。軽量な従来モデル', descEn: 'ConvNeXt-Small. Lighter legacy model' },
]

export function SettingsModal({ onClose, lang, modelVersion, onChangeModelVersion }: SettingsModalProps) {
  const [clearing, setClearing] = useState(false)
  const [cleared, setCleared] = useState(false)

  const handleClearModels = async () => {
    if (!window.confirm(
      lang === 'ja'
        ? 'キャッシュされたONNXモデルを削除しますか？次回起動時に再ダウンロードが必要です。'
        : 'Delete cached ONNX models? They will be re-downloaded on next startup.'
    )) return

    setClearing(true)
    try {
      await clearModelCache()
      setCleared(true)
      setTimeout(() => setCleared(false), 2000)
    } catch (err) {
      alert((err as Error).message)
    } finally {
      setClearing(false)
    }
  }

  return (
    <div className="panel-overlay" onClick={onClose}>
      <div className="panel panel-small" onClick={(e) => e.stopPropagation()}>
        <div className="panel-header">
          <h2>{lang === 'ja' ? '設定' : 'Settings'}</h2>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>

        <div className="panel-body">
          <section className="settings-section">
            <h3>{lang === 'ja' ? 'OCRモデル' : 'OCR Model'}</h3>
            <p className="settings-description">
              {lang === 'ja'
                ? '行認識（enc-dec）モデルの版を切り替えます。切替後、選んだ版のモデルを読み込み直します（未ダウンロードの場合は初回のみダウンロード）。'
                : 'Switch the line recognition (enc-dec) model version. The selected version is (re)loaded after switching (downloaded once if not cached).'}
            </p>
            <div className="settings-radio-group">
              {OCR_VERSIONS.map((v) => (
                <label key={v.value} className="settings-radio">
                  <input
                    type="radio"
                    name="ocr-version"
                    value={v.value}
                    checked={modelVersion === v.value}
                    onChange={() => onChangeModelVersion(v.value)}
                  />
                  <span className="settings-radio-label">
                    <strong>{v.label}</strong>
                    <span className="settings-radio-desc">{lang === 'ja' ? v.descJa : v.descEn}</span>
                  </span>
                </label>
              ))}
            </div>
          </section>

          <section className="settings-section">
            <h3>{lang === 'ja' ? 'モデルキャッシュ' : 'Model Cache'}</h3>
            <p className="settings-description">
              {lang === 'ja'
                ? 'ダウンロード済みのONNXモデルはIndexedDBにキャッシュされています。キャッシュをクリアすると次回起動時に再ダウンロードが必要です。'
                : 'Downloaded ONNX models are cached in IndexedDB. Clearing the cache requires re-downloading on next startup.'}
            </p>
            <button
              className="btn btn-secondary"
              onClick={handleClearModels}
              disabled={clearing}
            >
              {cleared
                ? (lang === 'ja' ? '✓ クリア完了' : '✓ Cleared')
                : clearing
                  ? (lang === 'ja' ? 'クリア中...' : 'Clearing...')
                  : (lang === 'ja' ? 'モデルキャッシュをクリア' : 'Clear Model Cache')}
            </button>
          </section>
        </div>
      </div>
    </div>
  )
}
