import { useEffect, useMemo, useRef, useState } from 'react'
import * as Koji from 'koji-lang'
import type { PageItem } from '../../types/ocr'
import { rawToKoji } from '../../lib/koji'
import { downloadPages, pageBaseName, type ExportFormat } from '../../lib/textExport'
import { DownloadMenu } from '../common/DownloadMenu'
import { translateToModern } from '../../lib/llm'
import type { useLlmSettings } from '../../hooks/useLlmSettings'
import '../../styles/koji-view.css'

interface ResultPanelProps {
  item: PageItem | null
  selectedOrder: number | null
  onSelectLine: (order: number) => void
  onUpdateLineText: (order: number, raw: string) => void
  lang: 'ja' | 'en'
  llm: ReturnType<typeof useLlmSettings>
  // PC のみ: パネル自身を畳むボタンを表示する。モバイルはタブで切替えるので不要。
  onHide?: () => void
  onOpenSettings?: () => void
}

type ViewMode = 'lines' | 'view' | 'modern'

// 翻訳キャッシュのキー用に翻刻テキストの簡易ハッシュ（再OCRで失効させる）
function hashStr(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return String(h >>> 0)
}

export function ResultPanel({ item, selectedOrder, onSelectLine, onUpdateLineText, lang, llm, onHide, onOpenSettings }: ResultPanelProps) {
  const [copied, setCopied] = useState(false)
  const [mode, setMode] = useState<ViewMode>('lines')
  const [editingOrder, setEditingOrder] = useState<number | null>(null)
  const editRef = useRef<HTMLDivElement | null>(null)

  // --- 現代語訳 ---
  const transCache = useRef<Map<string, string>>(new Map())
  const transAbort = useRef<AbortController | null>(null)
  const [transText, setTransText] = useState('')
  const [transLoading, setTransLoading] = useState(false)
  const [transErr, setTransErr] = useState<string | null>(null)

  const orderedLines = useMemo(
    () => (item ? [...item.lines].sort((a, b) => a.readingOrder - b.readingOrder) : []),
    [item]
  )
  const ocrLines = orderedLines.filter((l) => l.raw != null)

  // 全行を Koji 記法に変換して連結（閲覧モード／コピー用）
  const kojiSource = useMemo(
    () => ocrLines.map((l) => rawToKoji(l.raw ?? '')).join('\n'),
    [ocrLines]
  )

  // koji-lang で HTML 化（閲覧モード）
  const kojiHtml = useMemo(() => {
    if (mode !== 'view' || !kojiSource) return ''
    try {
      const { ast } = Koji.parse(kojiSource)
      const html = Koji.convertToHTML(ast)
      // 縦点（TATE）は「ー」で出力されるが、閲覧表示では「-」にする。
      // koji-lang は <span name='竪点'>…</span> で wrap するので、その中身だけを置換。
      return html.replace(/(<span\s+name=['"]竪点['"]>)[^<]*(<\/span>)/g, '$1-$2')
    } catch (e) {
      console.error('Koji parse/convert failed:', e)
      return ''
    }
  }, [mode, kojiSource])

  // 編集モード開始時に focus + 末尾にキャレット
  useEffect(() => {
    if (editingOrder == null || !editRef.current) return
    const el = editRef.current
    el.focus()
    const range = document.createRange()
    range.selectNodeContents(el)
    range.collapse(false)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
  }, [editingOrder])

  // モード切替 or 画像切替で編集を抜ける
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setEditingOrder(null) }, [item?.id, mode])

  // 現代語訳: 画像/翻刻が変わったらキャッシュ済み訳文を表示（無ければ空に）
  const transCacheKey = item ? `${item.id}|${hashStr(kojiSource)}` : ''
  useEffect(() => {
    transAbort.current?.abort()
    /* eslint-disable react-hooks/set-state-in-effect */
    setTransErr(null)
    setTransLoading(false)
    setTransText(transCacheKey ? (transCache.current.get(transCacheKey) ?? '') : '')
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [transCacheKey])

  // アンマウント時に進行中の翻訳を中断
  useEffect(() => () => transAbort.current?.abort(), [])

  const handleTranslate = async () => {
    if (!item || !kojiSource) return
    if (!llm.apiKey) { onOpenSettings?.(); return }
    transAbort.current?.abort()
    const ac = new AbortController()
    transAbort.current = ac
    setTransErr(null); setTransLoading(true); setTransText('')
    try {
      let acc = ''
      const full = await translateToModern({
        text: kojiSource, provider: llm.provider, model: llm.model, apiKey: llm.apiKey,
        signal: ac.signal,
        onToken: (d) => { acc += d; setTransText(acc) },
      })
      transCache.current.set(transCacheKey, full)
      setTransText(full)
    } catch (e) {
      if (!ac.signal.aborted) setTransErr((e as Error).message)
    } finally {
      if (transAbort.current === ac) { transAbort.current = null; setTransLoading(false) }
    }
  }

  const commitEdit = () => {
    if (editingOrder == null || !editRef.current) return
    const text = editRef.current.innerText.replace(/\r?\n/g, '').trim()
    onUpdateLineText(editingOrder, text)
    setEditingOrder(null)
  }
  const cancelEdit = () => setEditingOrder(null)

  const handleDownload = async (fmt: ExportFormat) => {
    if (!item) return
    try {
      await downloadPages([item], fmt, pageBaseName(item), false)
    } catch (e) {
      console.error('export failed:', e)
      alert(lang === 'ja' ? 'ファイル変換に失敗しました' : 'Export failed')
    }
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(kojiSource)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* ignore */ }
  }

  const placeholder = (text: string) => (
    <div className="vpanel-empty">
      <p>{text}</p>
    </div>
  )

  let body: React.ReactNode
  if (!item) {
    body = placeholder(lang === 'ja' ? '画像を選択してください' : 'Select an image')
  } else if (item.status === 'unprocessed') {
    body = placeholder(lang === 'ja' ? 'レイアウト認識を実行すると行が表示されます' : 'Run layout recognition to detect lines')
  } else if (item.status === 'layout' && ocrLines.length === 0) {
    // OCR 未実行（行の raw が1つも無い）時のみプレースホルダ。
    // OCR 中は raw が付いた行から順に表示したいので、ocrLines があれば下の描画へ進む。
    body = placeholder(lang === 'ja' ? 'OCRを実行すると翻刻が表示されます' : 'Run OCR to see the transcription')
  } else if (ocrLines.length === 0) {
    body = placeholder(lang === 'ja' ? 'テキストが検出されませんでした' : 'No text detected')
  } else if (mode === 'view') {
    // 閲覧モード: koji-lang で整形した HTML（ふりがな/返点/送り仮名/割書を組版表示）
    body = <div className="koji-scroll" dangerouslySetInnerHTML={{ __html: kojiHtml }} />
  } else if (mode === 'modern') {
    // 現代語訳モード: 翻刻全文を LLM に送り現代語訳をストリーム表示
    body = (
      <div className="koji-scroll modern-trans">
        {!llm.apiKey ? (
          <div className="vpanel-empty">
            {lang === 'ja' ? (
              <p>
                現代語訳の生成にはAPIキーの
                <button type="button" className="link-btn" onClick={() => onOpenSettings?.()}>設定</button>
                が必要です
              </p>
            ) : (
              <p>
                Generating a modern translation requires an API key.{' '}
                <button type="button" className="link-btn" onClick={() => onOpenSettings?.()}>Open settings</button>
              </p>
            )}
          </div>
        ) : (
          <>
            <div className="modern-trans-bar">
              <button className="btn btn-secondary" onClick={handleTranslate} disabled={transLoading}>
                {transLoading
                  ? (lang === 'ja' ? '翻訳中…' : 'Translating…')
                  : transText
                    ? (lang === 'ja' ? '再翻訳' : 'Re-translate')
                    : (lang === 'ja' ? '現代語訳する' : 'Translate')}
              </button>
              {transText && !transLoading && (
                <button
                  className="btn-mini"
                  onClick={() => { navigator.clipboard.writeText(transText).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }, () => {}) }}
                  title={lang === 'ja' ? 'コピー' : 'Copy'}
                >
                  {copied ? '✓' : (lang === 'ja' ? 'コピー' : 'Copy')}
                </button>
              )}
            </div>
            {transErr && <p className="vpanel-empty" style={{ color: '#c0392b' }}>{transErr}</p>}
            {transText ? (
              <div className="modern-trans-text">{transText}</div>
            ) : !transLoading && (
              <p className="settings-description">
                {lang === 'ja'
                  ? 'ボタンを押すと翻刻全文を LLM に送信し、現代語訳します（翻刻テキストが外部に送信されます）。'
                  : 'Sends the full transcription to the LLM for a modern-Japanese translation (your text leaves the browser).'}
              </p>
            )}
          </>
        )}
      </div>
    )
  } else {
    // 行モード: 行ごとにクリックで本文画像とハイライト連動
    body = (
      <div className="vtext">
        {ocrLines.map((line) => {
          const koji = rawToKoji(line.raw ?? '')
          const isEditing = editingOrder === line.readingOrder
          const isSelected = selectedOrder === line.readingOrder
          return (
            <div
              key={line.readingOrder}
              className={`vline ${isSelected ? 'selected' : ''} ${isEditing ? 'editing' : ''}`}
              onClick={() => { if (!isEditing) onSelectLine(line.readingOrder) }}
              title={`${line.readingOrder}`}
            >
              <span className="vline-no">{line.readingOrder}</span>
              {isEditing ? (
                <div
                  ref={editRef}
                  className="vline-text vline-edit"
                  contentEditable
                  suppressContentEditableWarning
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') { e.preventDefault(); cancelEdit() }
                    else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commitEdit() }
                    else if (e.key === 'Enter') { e.preventDefault() } // 改行禁止
                  }}
                  onBlur={commitEdit}
                  onClick={(e) => e.stopPropagation()}
                >
                  {koji}
                </div>
              ) : (
                <span className="vline-text">{koji || '　'}</span>
              )}
              <button
                className="vline-edit-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  if (isEditing) commitEdit()
                  else { onSelectLine(line.readingOrder); setEditingOrder(line.readingOrder) }
                }}
                title={lang === 'ja' ? (isEditing ? '確定' : '編集') : (isEditing ? 'Done' : 'Edit')}
                aria-label={isEditing ? 'commit edit' : 'edit line'}
              >
                {isEditing ? '✓' : '✎'}
              </button>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="vpanel">
      <div className="vpanel-header">
        <div className="vpanel-header-left">
          {onHide && (
            <button
              className="btn-mini vpanel-hide"
              onClick={onHide}
              title={lang === 'ja' ? '翻刻パネルを隠す' : 'Hide transcription panel'}
              aria-label={lang === 'ja' ? '翻刻パネルを隠す' : 'Hide panel'}
            >
              ▶
            </button>
          )}
          <span className="vpanel-title">{lang === 'ja' ? '翻刻' : 'Transcription'}</span>
        </div>
        <div className="vpanel-tools">
          <div className="seg">
            <button className={`seg-btn ${mode === 'lines' ? 'active' : ''}`} onClick={() => setMode('lines')}>
              {lang === 'ja' ? '行' : 'Lines'}
            </button>
            <button className={`seg-btn ${mode === 'view' ? 'active' : ''}`} onClick={() => setMode('view')}>
              {lang === 'ja' ? '閲覧' : 'View'}
            </button>
            <button className={`seg-btn ${mode === 'modern' ? 'active' : ''}`} onClick={() => setMode('modern')}>
              {lang === 'ja' ? '現代語訳' : 'Modern'}
            </button>
          </div>
          {ocrLines.length > 0 && (
            <>
              <button className="btn-mini" onClick={handleCopy} title={lang === 'ja' ? 'コピー' : 'Copy'}>
                {copied ? (lang === 'ja' ? '✓' : '✓') : (lang === 'ja' ? 'コピー' : 'Copy')}
              </button>
              <DownloadMenu label={lang === 'ja' ? '保存' : 'Save'} onSelect={handleDownload} />
            </>
          )}
        </div>
      </div>
      {body}
      <div className="vpanel-footer">
        <a
          href="https://www.wiki.honkoku.org/doku.php?id=howto_markup"
          target="_blank"
          rel="noopener noreferrer"
        >
          {lang === 'ja' ? 'みんなで翻刻記法について ↗' : 'About Minna de Honkoku notation ↗'}
        </a>
      </div>
    </div>
  )
}
