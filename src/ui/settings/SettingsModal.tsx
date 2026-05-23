import { useState } from 'react'
import { clearModelCache } from '../../ocr/model-loader'

interface SettingsModalProps {
  onClose: () => void
  lang: 'ja' | 'en'
}

export function SettingsModal({ onClose, lang }: SettingsModalProps) {
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
