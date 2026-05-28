import type { JobProgress } from '../types/ocr'
import type { FileLoadingState } from '../hooks/useFileProcessor'
import type { Language } from '../hooks/useLang'

interface JobBarProps {
  job: JobProgress
  isLoadingFiles: boolean
  fileLoadingState: FileLoadingState | null
  lang: Language
}

/** レイアウト/OCR 実行中の進捗バー、およびファイル読み込み中の表示 */
export function JobBar({ job, isLoadingFiles, fileLoadingState, lang }: JobBarProps) {
  if (job.active) {
    const pct = Math.round(((job.current - 1 + job.detail) / Math.max(1, job.total)) * 100)
    return (
      <div className="jobbar">
        <div className="jobbar-row">
          <span className="jobbar-left">
            {job.kind === 'ocr' && (
              <img className="jobbar-icon" src={`${import.meta.env.BASE_URL}soramaru/11_analyse.png`} alt="" />
            )}
            <span className="jobbar-stage">
              {job.kind === 'layout' ? (lang === 'ja' ? 'レイアウト認識' : 'Layout') : 'OCR'}
              {job.total > 1 && `（${job.current}/${job.total}）`}
            </span>
          </span>
          <span className="jobbar-msg">{job.message}</span>
        </div>
        <div className="bar-track">
          <div className="bar-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>
    )
  }
  if (isLoadingFiles && fileLoadingState) {
    return (
      <div className="jobbar">
        <div className="jobbar-row">
          <span className="jobbar-stage">{lang === 'ja' ? '読み込み中' : 'Loading'}</span>
          <span className="jobbar-msg">
            {fileLoadingState.currentPage != null && fileLoadingState.totalPages != null
              ? `${fileLoadingState.fileName} (${fileLoadingState.currentPage}/${fileLoadingState.totalPages})`
              : fileLoadingState.fileName}
          </span>
        </div>
      </div>
    )
  }
  return null
}
