import { useRef } from 'react'

interface DirectoryPickerProps {
  onFilesSelected: (files: File[]) => void
  lang: 'ja' | 'en'
  disabled?: boolean
}

export function DirectoryPicker({ onFilesSelected, lang, disabled = false }: DirectoryPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  const handleChange = () => {
    const files = inputRef.current?.files
    if (!files) return
    const accepted = Array.from(files).filter(
      (f) => f.type === 'application/pdf' || f.type.startsWith('image/')
    )
    if (accepted.length > 0) onFilesSelected(accepted)
  }

  return (
    <>
      <button
        className="btn btn-secondary"
        onClick={() => !disabled && inputRef.current?.click()}
        disabled={disabled}
      >
        📂 {lang === 'ja' ? 'フォルダを選択' : 'Select Folder'}
      </button>
      <input
        ref={inputRef}
        type="file"
        // @ts-expect-error webkitdirectory is not in standard types
        webkitdirectory=""
        multiple
        onChange={handleChange}
        style={{ display: 'none' }}
      />
    </>
  )
}
