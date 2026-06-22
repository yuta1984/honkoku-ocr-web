import { useState } from 'react'
import { clearModelCache } from '../../ocr/model-loader'
import type { OcrModelVersion, LayoutModelVersion } from '../../ocr/model-loader'
import type { useLlmSettings } from '../../hooks/useLlmSettings'
import type { LlmProvider } from '../../lib/llm'
import { PROVIDER_LABEL, PROVIDER_MODELS, translateToModern } from '../../lib/llm'
import type { StorageMode } from '../../lib/keyStore'

interface SettingsModalProps {
  onClose: () => void
  lang: 'ja' | 'en'
  modelVersion: OcrModelVersion
  onChangeModelVersion: (next: OcrModelVersion) => void
  layoutVersion: LayoutModelVersion
  onChangeLayoutVersion: (next: LayoutModelVersion) => void
  showGuide: boolean
  onChangeShowGuide: (next: boolean) => void
  llm: ReturnType<typeof useLlmSettings>
}

const OCR_VERSIONS: { value: OcrModelVersion; label: string; descJa: string; descEn: string }[] = [
  { value: 'v13', label: 'v13', descJa: 'ConvNeXt V2 + 256×2048 高解像度 + KV キャッシュ。高精度。test plain CER 0.0873（推奨）', descEn: 'ConvNeXt V2 + 256×2048 high-res + KV cache. Highest accuracy. test plain CER 0.0873 (recommended)' },
  { value: 'v12', label: 'v12', descJa: 'ConvNeXt V1 + 192×1536 高解像度 + KV キャッシュ。高速・軽量。test plain CER 0.0906（v13 比 +3.8%）', descEn: 'ConvNeXt V1 + 192×1536 high-res + KV cache. Faster, lighter. test plain CER 0.0906 (+3.8% vs v13)' },
]

const LAYOUT_VERSIONS: { value: LayoutModelVersion; label: string; descJa: string; descEn: string }[] = [
  { value: 'rtmdet', label: 'RTMDet-s（NDL古典籍OCR-Lite）', descJa: 'NDL古典籍OCR-Lite に附属のレイアウト認識モデル（推奨）', descEn: 'Layout detection model bundled with NDL Kotenseki OCR-Lite (recommended)' },
  { value: 'yolo',   label: 'YOLOv8', descJa: '本システムオリジナルのレイアウト認識モデル', descEn: 'Layout detection model originally developed for this system' },
]

const STORAGE_MODES: { value: StorageMode; labelJa: string; labelEn: string; descJa: string; descEn: string }[] = [
  { value: 'session', labelJa: 'セッションのみ', labelEn: 'Session only', descJa: 'タブを閉じると消去（最も安全寄り・毎回入力）', descEn: 'Cleared when the tab closes (safest; re-enter each session)' },
  { value: 'local', labelJa: 'このブラウザに保存', labelEn: 'Save in this browser', descJa: '平文で localStorage に保存（一度入力で永続・XSSリスクあり）', descEn: 'Stored as plaintext in localStorage (persists; XSS risk)' },
  { value: 'encrypted', labelJa: 'パスフレーズで暗号化保存', labelEn: 'Passphrase-encrypted', descJa: 'AES-GCM 暗号化して保存（at restで保護・セッション毎にパスフレーズ入力）', descEn: 'AES-GCM encrypted at rest (enter passphrase each session)' },
]

type SettingsTab = 'recognition' | 'translation' | 'general'

export function SettingsModal({ onClose, lang, modelVersion, onChangeModelVersion, layoutVersion, onChangeLayoutVersion, showGuide, onChangeShowGuide, llm }: SettingsModalProps) {
  const [tab, setTab] = useState<SettingsTab>('recognition')
  const [clearing, setClearing] = useState(false)
  const [cleared, setCleared] = useState(false)

  // --- LLM セクションのローカル状態 ---
  const [keyInput, setKeyInput] = useState('')
  const [passInput, setPassInput] = useState('')
  const [unlockPass, setUnlockPass] = useState('')
  const [llmMsg, setLlmMsg] = useState<{ kind: 'ok' | 'err' | 'info'; text: string } | null>(null)
  const [testing, setTesting] = useState(false)

  const ja = lang === 'ja'

  const handleClearModels = async () => {
    if (!window.confirm(
      ja
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

  const handleSaveKey = async () => {
    setLlmMsg(null)
    if (!keyInput.trim()) { setLlmMsg({ kind: 'err', text: ja ? 'APIキーを入力してください' : 'Enter an API key' }); return }
    if (llm.storageMode === 'encrypted' && !passInput) { setLlmMsg({ kind: 'err', text: ja ? 'パスフレーズを入力してください' : 'Enter a passphrase' }); return }
    try {
      await llm.saveApiKey(keyInput.trim(), passInput || undefined)
      setKeyInput(''); setPassInput('')
      setLlmMsg({ kind: 'ok', text: ja ? '✓ APIキーを保存しました' : '✓ API key saved' })
    } catch (e) {
      setLlmMsg({ kind: 'err', text: (e as Error).message })
    }
  }

  const handleUnlock = async () => {
    setLlmMsg(null)
    try {
      await llm.unlock(unlockPass)
      setUnlockPass('')
      setLlmMsg({ kind: 'ok', text: ja ? '✓ 解錠しました' : '✓ Unlocked' })
    } catch (e) {
      setLlmMsg({ kind: 'err', text: ja ? 'パスフレーズが違います' : 'Wrong passphrase' + (e ? '' : '') })
    }
  }

  const handleClearKey = () => {
    llm.clearApiKey()
    setLlmMsg({ kind: 'info', text: ja ? 'APIキーを消去しました' : 'API key cleared' })
  }

  const handleTest = async () => {
    if (!llm.apiKey) { setLlmMsg({ kind: 'err', text: ja ? 'APIキーが未設定です' : 'No API key set' }); return }
    setTesting(true); setLlmMsg({ kind: 'info', text: ja ? '接続テスト中…' : 'Testing…' })
    try {
      await translateToModern({ text: '是、試みなり。', provider: llm.provider, model: llm.model, apiKey: llm.apiKey })
      setLlmMsg({ kind: 'ok', text: ja ? '✓ 接続OK' : '✓ Connection OK' })
    } catch (e) {
      setLlmMsg({ kind: 'err', text: (ja ? '接続失敗: ' : 'Failed: ') + (e as Error).message })
    } finally {
      setTesting(false)
    }
  }

  const keyStatus = llm.needsUnlock
    ? (ja ? '暗号化キーあり（要解錠）' : 'Encrypted key (locked)')
    : llm.apiKey
      ? (ja ? '設定済み' : 'Set')
      : (ja ? '未設定' : 'Not set')

  return (
    <div className="panel-overlay" onClick={onClose}>
      <div className="panel panel-small" onClick={(e) => e.stopPropagation()}>
        <div className="panel-header">
          <h2>{ja ? '設定' : 'Settings'}</h2>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>

        <div className="settings-tabs" role="tablist">
          <button className={`settings-tab${tab === 'recognition' ? ' active' : ''}`} role="tab" aria-selected={tab === 'recognition'} onClick={() => setTab('recognition')}>
            {ja ? '認識' : 'Recognition'}
          </button>
          <button className={`settings-tab${tab === 'translation' ? ' active' : ''}`} role="tab" aria-selected={tab === 'translation'} onClick={() => setTab('translation')}>
            {ja ? '現代語訳' : 'Translation'}
          </button>
          <button className={`settings-tab${tab === 'general' ? ' active' : ''}`} role="tab" aria-selected={tab === 'general'} onClick={() => setTab('general')}>
            {ja ? '表示・その他' : 'General'}
          </button>
        </div>

        <div className="panel-body">
          {tab === 'recognition' && <>
          <section className="settings-section">
            <h3>{ja ? 'OCRモデル' : 'OCR Model'}</h3>
            <p className="settings-description">
              {ja
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
                    <span className="settings-radio-desc">{ja ? v.descJa : v.descEn}</span>
                  </span>
                </label>
              ))}
            </div>
          </section>

          <section className="settings-section">
            <h3>{ja ? 'レイアウト検出モデル' : 'Layout Detection Model'}</h3>
            <p className="settings-description">
              {ja
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
                    <span className="settings-radio-desc">{ja ? v.descJa : v.descEn}</span>
                  </span>
                </label>
              ))}
            </div>
          </section>
          </>}

          {tab === 'translation' && <>
          <section className="settings-section">
            <h3>{ja ? '現代語訳（LLM）' : 'Modern translation (LLM)'}</h3>
            <p className="settings-description">
              {ja
                ? '翻刻結果を LLM に送って現代語訳します。APIキーは各自で用意し、下記の方式でこの端末に保存します。'
                : 'Send the transcription to an LLM for a modern-Japanese translation. Provide your own API key, stored on this device with the method below.'}
            </p>

            {/* プロバイダ */}
            <div className="settings-radio-group">
              {(Object.keys(PROVIDER_LABEL) as LlmProvider[]).map((p) => (
                <label key={p} className="settings-radio">
                  <input type="radio" name="llm-provider" value={p} checked={llm.provider === p} onChange={() => llm.setProvider(p)} />
                  <span className="settings-radio-label"><strong>{PROVIDER_LABEL[p]}</strong></span>
                </label>
              ))}
            </div>

            {/* モデル */}
            <label className="settings-field">
              <span className="settings-field-label">{ja ? 'モデル' : 'Model'}</span>
              <select value={llm.model} onChange={(e) => llm.setModel(e.target.value)}>
                {PROVIDER_MODELS[llm.provider].map((m) => (
                  <option key={m.value} value={m.value}>{m.labelJa}</option>
                ))}
              </select>
            </label>

            {/* 保存方式 */}
            <div className="settings-radio-group" style={{ marginTop: 8 }}>
              {STORAGE_MODES.map((s) => (
                <label key={s.value} className="settings-radio">
                  <input type="radio" name="llm-storage" value={s.value} checked={llm.storageMode === s.value} onChange={() => llm.setStorageMode(s.value)} />
                  <span className="settings-radio-label">
                    <strong>{ja ? s.labelJa : s.labelEn}</strong>
                    <span className="settings-radio-desc">{ja ? s.descJa : s.descEn}</span>
                  </span>
                </label>
              ))}
            </div>

            {/* 解錠 UI（encrypted 保存があり未解錠のとき） */}
            {llm.needsUnlock && (
              <div className="settings-field" style={{ marginTop: 8 }}>
                <span className="settings-field-label">{ja ? '保存済み暗号化キーを解錠' : 'Unlock stored key'}</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input type="password" value={unlockPass} onChange={(e) => setUnlockPass(e.target.value)} placeholder={ja ? 'パスフレーズ' : 'Passphrase'} autoComplete="off" />
                  <button className="btn btn-secondary" onClick={handleUnlock}>{ja ? '解錠' : 'Unlock'}</button>
                </div>
              </div>
            )}

            {/* キー入力 */}
            <label className="settings-field" style={{ marginTop: 8 }}>
              <span className="settings-field-label">{ja ? 'APIキー' : 'API key'}（{keyStatus}）</span>
              <input type="password" value={keyInput} onChange={(e) => setKeyInput(e.target.value)} placeholder={ja ? '新しいキーを貼り付け' : 'Paste a new key'} autoComplete="off" />
            </label>
            {llm.storageMode === 'encrypted' && (
              <label className="settings-field" style={{ marginTop: 6 }}>
                <span className="settings-field-label">{ja ? 'パスフレーズ（暗号化用）' : 'Passphrase (for encryption)'}</span>
                <input type="password" value={passInput} onChange={(e) => setPassInput(e.target.value)} placeholder={ja ? 'パスフレーズ' : 'Passphrase'} autoComplete="off" />
              </label>
            )}

            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-secondary" onClick={handleSaveKey}>{ja ? 'キーを保存' : 'Save key'}</button>
              <button className="btn btn-secondary" onClick={handleTest} disabled={testing || !llm.apiKey}>{ja ? '接続テスト' : 'Test'}</button>
              <button className="btn btn-secondary" onClick={handleClearKey} disabled={!llm.hasKeyStored && !llm.apiKey}>{ja ? 'キーを消去' : 'Clear key'}</button>
            </div>
            {llmMsg && (
              <p className="settings-description" style={{ color: llmMsg.kind === 'err' ? '#c0392b' : llmMsg.kind === 'ok' ? '#1e7d34' : undefined, marginTop: 6 }}>
                {llmMsg.text}
              </p>
            )}

            <p className="settings-description" style={{ marginTop: 8, fontSize: '0.8em' }}>
              {ja
                ? '⚠ APIキーはブラウザ内に保存され、翻訳実行時に各プロバイダへ HTTPS で送信されます。翻刻テキストも外部 LLM に送信されます（資料内容が第三者に渡ります）。共有端末ではセッションのみ／暗号化保存を推奨します。'
                : '⚠ The API key is stored in your browser and sent to the provider over HTTPS when translating. Your transcription is also sent to the external LLM (your content leaves the browser). On shared devices, prefer session-only or encrypted storage.'}
            </p>
          </section>
          </>}

          {tab === 'general' && <>
          <section className="settings-section">
            <h3>{ja ? '表示' : 'Display'}</h3>
            <label className="settings-checkbox">
              <input
                type="checkbox"
                checked={showGuide}
                onChange={(e) => onChangeShowGuide(e.target.checked)}
              />
              <span>{ja ? 'ガイドメッセージを表示する' : 'Show guide messages'}</span>
            </label>
            <p className="settings-description settings-checkbox-desc">
              {ja
                ? '操作ガイド（②③ などの手順説明や OCR 完了通知）を表示します。'
                : 'Show step-by-step guidance (② ③ hints, OCR completion notices, etc.).'}
            </p>
          </section>

          <section className="settings-section">
            <h3>{ja ? 'モデルキャッシュ' : 'Model Cache'}</h3>
            <p className="settings-description">
              {ja
                ? 'ダウンロード済みのONNXモデルはIndexedDBにキャッシュされています。キャッシュをクリアすると次回起動時に再ダウンロードが必要です。'
                : 'Downloaded ONNX models are cached in IndexedDB. Clearing the cache requires re-downloading on next startup.'}
            </p>
            <button
              className="btn btn-secondary"
              onClick={handleClearModels}
              disabled={clearing}
            >
              {cleared
                ? (ja ? '✓ クリア完了' : '✓ Cleared')
                : clearing
                  ? (ja ? 'クリア中...' : 'Clearing...')
                  : (ja ? 'モデルキャッシュをクリア' : 'Clear Model Cache')}
            </button>
          </section>
          </>}
        </div>
      </div>
    </div>
  )
}
