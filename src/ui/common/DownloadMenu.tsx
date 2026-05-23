import { useState, useRef, useEffect } from 'react'
import type { ExportFormat } from '../../lib/textExport'

interface DownloadMenuProps {
  label: string
  disabled?: boolean
  block?: boolean
  onSelect: (format: ExportFormat) => void
}

const ITEMS: Array<{ fmt: ExportFormat; label: string }> = [
  { fmt: 'txt', label: 'テキスト (.txt)' },
  { fmt: 'xml', label: 'Koji XML (.xml)' },
  { fmt: 'docx', label: 'Word (.docx)' },
]

export function DownloadMenu({ label, disabled, block, onSelect }: DownloadMenuProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div className={`dlmenu ${block ? 'dlmenu-block' : ''}`} ref={ref}>
      <button
        className={`btn ${block ? 'btn-outline btn-block' : 'btn-mini'}`}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        {label} ▾
      </button>
      {open && (
        <div className="dlmenu-list">
          {ITEMS.map((it) => (
            <button key={it.fmt} onClick={() => { setOpen(false); onSelect(it.fmt) }}>
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
