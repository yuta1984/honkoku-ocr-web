import { useState } from 'react'
import { clearModelCache } from '../../ocr/model-loader'
import type { OcrModelVersion, LayoutModelVersion } from '../../ocr/model-loader'

interface SettingsModalProps {
  onClose: () => void
  lang: 'ja' | 'en'
  modelVersion: OcrModelVersion
  onChangeModelVersion: (next: OcrModelVersion) => void
  layoutVersion: LayoutModelVersion
  onChangeLayoutVersion: (next: LayoutModelVersion) => void
  showGuide: boolean
  onChangeShowGuide: (next: boolean) => void
}

const OCR_VERSIONS: { value: OcrModelVersion; label: string; descJa: string; descEn: string }[] = [
  { value: 'v13', label: 'v13', descJa: 'ConvNeXt V2 + 256×2048 高解像度 + KV キャッシュ。test plain CER 0.0873 (v12 比 -3.6%)（推奨）', descEn: 'ConvNeXt V2 + 256×2048 high-res + KV cache. test plain CER 0.0873 (-3.6% vs v12) (recommended)' },
  { value: 'v12', label: 'v12', descJa: 'ConvNeXt V1 + 192×1536 高解像度 + KOJI_NO_RT2 + KV キャッシュ。test plain CER 0.0906', descEn: 'ConvNeXt V1 + 192×1536 high-res + KOJI_NO_RT2 + KV cache. test plain CER 0.0906' },
  { value: 'v11', label: 'v11', descJa: 'ConvNeXt-Base + 拡充データ。返点・送り仮名 F1 改善（128×1024）', descEn: 'ConvNeXt-Base + enriched data. Improves kaeriten/okurigana F1 (128×1024)' },
]

const LAYOUT_VERSIONS: { value: LayoutModelVersion; label: string; descJa: string; descEn: string }[] = [
  { value: 'rtmdet', label: 'RTMDet-s（NDL古典籍OCR-Lite）', descJa: 'NDL古典籍OCR-Lite に附属のレイアウト認識モデル（推奨）', descEn: 'Layout detection model bundled with NDL Kotenseki OCR-Lite (recommended)' },
  { value: 'yolo',   label: 'YOLOv8', descJa: '本システムオリジナルのレイアウト認識モデル', descEn: 'Layout detection model originally developed for this system' },
]

export function SettingsModal({ onClose, lang, modelVersion, onChangeModelVersion, layoutVersion, onChangeLayoutVersion, showGuide, onChangeShowGuide }: SettingsModalProps) {
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
            <h3>{lang === 'ja' ? 'レイアウト検出モデル' : 'Layout Detection Model'}</h3>
            <p className="settings-description">
              {lang === 'ja'
                ? '行/領域を検出するレイアウトモデルを切り替えます。切替後はモデルを読み込み直します（未ダウンロードの場合のみ実際の通信が発生）。'
                : 'Switch the layout (line/region) detection model. The selected model is (re)loaded after switching (network only on first download).'}
            </p>
            <div className="settings-radio-group">
              {LAYOUT_VERSIONS.map((v) => (
                <label key={v.value} className="settings-radio">
                  <input
                    type="radio"
                    name="layout-version"
                    value={v.value}
                    checked={layoutVersion === v.value}
                    onChange={() => onChangeLayoutVersion(v.value)}
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
            <h3>{lang === 'ja' ? '表示' : 'Display'}</h3>
            <label className="settings-checkbox">
              <input
                type="checkbox"
                checked={showGuide}
                onChange={(e) => onChangeShowGuide(e.target.checked)}
              />
              <span>{lang === 'ja' ? 'ガイドメッセージを表示する' : 'Show guide messages'}</span>
            </label>
            <p className="settings-description settings-checkbox-desc">
              {lang === 'ja'
                ? '操作ガイド（②③ などの手順説明や OCR 完了通知）を表示します。'
                : 'Show step-by-step guidance (② ③ hints, OCR completion notices, etc.).'}
            </p>
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
