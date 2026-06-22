import { useRef, useState } from 'react'
import type { Language } from '../../hooks/useLang'
import { fetchManifest, fetchCanvasImage, IIIF_MAX_EDGE } from '../../lib/iiif'
import type { IiifManifest } from '../../lib/iiif'

interface IiifImportModalProps {
  lang: Language
  onAddImages: (files: File[]) => void
  onClose: () => void
}

/**
 * IIIF Presentation マニフェスト(v2/v3)の URL を入力 → カンバス一覧を取得 →
 * 各画像を File 化して onAddImages に流す。取得は中断可能。
 */
export function IiifImportModal({ lang, onAddImages, onClose }: IiifImportModalProps) {
  const t = lang === 'ja'
  const [url, setUrl] = useState('')
  const [manifest, setManifest] = useState<IiifManifest | null>(null)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const handleLoadManifest = async () => {
    const u = url.trim()
    if (!u) { setError(t ? 'マニフェスト URL を入力してください' : 'Enter a manifest URL'); return }
    setError(null); setManifest(null); setLoading(true)
    const ac = new AbortController(); abortRef.current = ac
    try {
      const m = await fetchManifest(u, ac.signal)
      setManifest(m)
    } catch (e) {
      setError((t ? '読み込み失敗: ' : 'Failed: ') + (e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const handleImport = async () => {
    if (!manifest) return
    setError(null)
    const ac = new AbortController(); abortRef.current = ac
    const total = manifest.images.length
    setProgress({ done: 0, total })
    let ok = 0
    const failed: string[] = []
    try {
      for (let i = 0; i < manifest.images.length; i++) {
        if (ac.signal.aborted) break
        try {
          const file = await fetchCanvasImage(manifest.images[i], i, ac.signal)
          onAddImages([file])   // 1 枚ずつ流して逐次サムネイル表示
          ok++
        } catch (e) {
          if (ac.signal.aborted) break
          failed.push(manifest.images[i].label)
          console.error('IIIF image fetch failed:', manifest.images[i].url, e)
        }
        setProgress({ done: i + 1, total })
      }
      if (ac.signal.aborted) {
        setError(t ? `中断しました(${ok}/${total} 取り込み済み)` : `Cancelled (${ok}/${total} imported)`)
      } else if (failed.length) {
        setError(t ? `${ok}/${total} 取り込み・${failed.length} 件失敗` : `${ok}/${total} imported, ${failed.length} failed`)
      } else {
        onClose()
      }
    } finally {
      if (!ac.signal.aborted) setProgress(null)
    }
  }

  const handleCancel = () => {
    abortRef.current?.abort()
  }

  const importing = progress != null

  return (
    <div className="panel-overlay" onClick={() => { if (!importing) onClose() }}>
      <div className="panel panel-small" onClick={(e) => e.stopPropagation()}>
        <div className="panel-header">
          <h2>{t ? 'IIIF マニフェストから取り込み' : 'Import from IIIF manifest'}</h2>
          <button className="btn-close" onClick={onClose} disabled={importing}>✕</button>
        </div>
        <div className="panel-body">
          <p className="settings-description">
            {t
              ? 'IIIF Presentation マニフェスト(v2/v3)の URL を貼り付けてください。各ページ画像を読み込みます。'
              : 'Paste a IIIF Presentation manifest URL (v2/v3). Each page image will be loaded.'}
          </p>

          <label className="settings-field">
            <span className="settings-field-label">{t ? 'マニフェスト URL' : 'Manifest URL'}</span>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !loading && !importing) handleLoadManifest() }}
              placeholder="https://.../manifest.json"
              disabled={importing}
              autoComplete="off"
            />
          </label>

          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button className="btn btn-secondary" onClick={handleLoadManifest} disabled={loading || importing}>
              {loading ? (t ? '読み込み中…' : 'Loading…') : (t ? 'マニフェストを読み込む' : 'Load manifest')}
            </button>
          </div>

          {manifest && !importing && (
            <div className="settings-field" style={{ marginTop: 12 }}>
              <span className="settings-field-label">{manifest.label}</span>
              <p className="settings-description" style={{ margin: '4px 0 8px' }}>
                {t
                  ? `${manifest.images.length} ページを取り込みます(長辺 最大 ${IIIF_MAX_EDGE}px)。`
                  : `${manifest.images.length} pages will be imported (max ${IIIF_MAX_EDGE}px long edge).`}
              </p>
              <button className="btn btn-primary" onClick={handleImport}>
                {t ? `${manifest.images.length} ページを取り込む` : `Import ${manifest.images.length} pages`}
              </button>
            </div>
          )}

          {importing && progress && (
            <div className="settings-field" style={{ marginTop: 12 }}>
              <p className="settings-description" style={{ margin: '0 0 8px' }}>
                {t ? `取り込み中… ${progress.done} / ${progress.total}` : `Importing… ${progress.done} / ${progress.total}`}
              </p>
              <button className="btn btn-secondary" onClick={handleCancel}>{t ? '中断' : 'Cancel'}</button>
            </div>
          )}

          {error && (
            <p className="settings-description" style={{ color: '#c0392b', marginTop: 10 }}>{error}</p>
          )}

          <p className="settings-description" style={{ marginTop: 12, fontSize: '0.8em' }}>
            {t
              ? '※ 画像の取得には提供元サーバの CORS 許可が必要です。許可がない場合は読み込めません。'
              : '※ The provider must allow cross-origin (CORS) access; otherwise images cannot be loaded.'}
          </p>
        </div>
      </div>
    </div>
  )
}
