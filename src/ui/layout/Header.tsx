import type { Language } from '../../hooks/useLang'

interface HeaderProps {
  lang: Language
  onToggleLanguage: () => void
  onOpenSettings: () => void
  onOpenAbout: () => void
  onOpenTechInfo: () => void
  onLogoClick: () => void
}

export function Header({ lang, onToggleLanguage, onOpenSettings, onOpenAbout, onOpenTechInfo, onLogoClick }: HeaderProps) {
  return (
    <header className="header">
      <button className="header-title" onClick={onLogoClick}>
        <img className="header-logo" src={`${import.meta.env.BASE_URL}soramaru/01_normal.png`} alt="" />
        <h1>みんなで翻刻OCR</h1>
        <span className="header-subtitle">
          {lang === 'ja' ? '市民の力で作ったくずし字AI-OCR' : 'Kuzushiji AI-OCR powered by citizen scholars'}
        </span>
      </button>
      <div className="header-actions">
        <button className="btn-header-link" onClick={onOpenAbout}>
          {lang === 'ja' ? '本アプリについて' : 'About'}
        </button>
        <button className="btn-header-link" onClick={onOpenTechInfo}>
          {lang === 'ja' ? '技術情報' : 'Technical Details'}
        </button>
        <button className="btn-icon" onClick={onOpenSettings} title={lang === 'ja' ? '設定' : 'Settings'}>
          ⚙️
        </button>
        <button className="btn-lang" onClick={onToggleLanguage}>
          {lang === 'ja' ? 'English' : '日本語'}
        </button>
      </div>
    </header>
  )
}
