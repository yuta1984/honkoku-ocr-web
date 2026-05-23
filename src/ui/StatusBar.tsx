import type { ModelState } from '../types/ocr'
import type { Language } from '../hooks/useLang'

const MODEL_LABELS = [['layout', 'レイアウト'], ['encoder', 'エンコーダ'], ['decoder', 'デコーダ']] as const

/** モデルのダウンロード/初期化ステータスバー（ready の間は非表示） */
export function StatusBar({ modelState, lang }: { modelState: ModelState; lang: Language }) {
  if (modelState.status === 'ready') return null
  const isError = modelState.status === 'error'
  const pct = Math.round(modelState.progress * 100)

  return (
    <div className={`statusbar ${isError ? 'statusbar-error' : ''}`}>
      <div className="statusbar-row">
        <span className="statusbar-msg">
          {isError
            ? `${modelState.message}: ${modelState.error ?? ''}`
            : modelState.message || (lang === 'ja' ? 'モデルを準備中...' : 'Preparing models...')}
        </span>
        {!isError && <span className="statusbar-pct">{pct}%</span>}
      </div>
      {!isError && (
        <div className="bar-track">
          <div className="bar-fill" style={{ width: `${pct}%` }} />
        </div>
      )}
      {modelState.modelProgress && (
        <div className="statusbar-models">
          {MODEL_LABELS.map(([k, label]) => (
            <span key={k} className="statusbar-model">
              {label} {Math.round(modelState.modelProgress![k] * 100)}%
            </span>
          ))}
        </div>
      )}
      {!isError && modelState.progress < 0.95 && (
        <p className="statusbar-note">
          {lang === 'ja'
            ? '初回のみモデル(約120MB)をダウンロードします。次回からはキャッシュから高速起動します。'
            : 'Models (~120MB) download once on first run, then load instantly from cache.'}
        </p>
      )}
    </div>
  )
}
