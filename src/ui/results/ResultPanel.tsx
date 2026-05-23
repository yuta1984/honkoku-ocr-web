import { useMemo, useState } from 'react'
import * as Koji from 'koji-lang'
import type { PageItem } from '../../types/ocr'
import { rawToKoji } from '../../lib/koji'
import { downloadPages, pageBaseName, type ExportFormat } from '../../lib/textExport'
import { DownloadMenu } from '../common/DownloadMenu'
import '../../styles/koji-view.css'

interface ResultPanelProps {
  item: PageItem | null
  selectedOrder: number | null
  onSelectLine: (order: number) => void
  lang: 'ja' | 'en'
}

type ViewMode = 'lines' | 'view'

export function ResultPanel({ item, selectedOrder, onSelectLine, lang }: ResultPanelProps) {
  const [copied, setCopied] = useState(false)
  const [mode, setMode] = useState<ViewMode>('lines')

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
      return Koji.convertToHTML(ast)
    } catch (e) {
      console.error('Koji parse/convert failed:', e)
      return ''
    }
  }, [mode, kojiSource])

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
  } else if (item.status === 'layout') {
    body = placeholder(lang === 'ja' ? 'OCRを実行すると翻刻が表示されます' : 'Run OCR to see the transcription')
  } else if (ocrLines.length === 0) {
    body = placeholder(lang === 'ja' ? 'テキストが検出されませんでした' : 'No text detected')
  } else if (mode === 'view') {
    // 閲覧モード: koji-lang で整形した HTML（ふりがな/返点/送り仮名/割書を組版表示）
    body = <div className="koji-scroll" dangerouslySetInnerHTML={{ __html: kojiHtml }} />
  } else {
    // 行モード: 行ごとにクリックで本文画像とハイライト連動
    body = (
      <div className="vtext">
        {ocrLines.map((line) => {
          const koji = rawToKoji(line.raw ?? '')
          return (
            <div
              key={line.readingOrder}
              className={`vline ${selectedOrder === line.readingOrder ? 'selected' : ''}`}
              onClick={() => onSelectLine(line.readingOrder)}
              title={`${line.readingOrder}`}
            >
              <span className="vline-no">{line.readingOrder}</span>
              <span className="vline-text">{koji || '　'}</span>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="vpanel">
      <div className="vpanel-header">
        <span className="vpanel-title">{lang === 'ja' ? '翻刻' : 'Transcription'}</span>
        <div className="vpanel-tools">
          <div className="seg">
            <button className={`seg-btn ${mode === 'lines' ? 'active' : ''}`} onClick={() => setMode('lines')}>
              {lang === 'ja' ? '行' : 'Lines'}
            </button>
            <button className={`seg-btn ${mode === 'view' ? 'active' : ''}`} onClick={() => setMode('view')}>
              {lang === 'ja' ? '閲覧' : 'View'}
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
    </div>
  )
}
