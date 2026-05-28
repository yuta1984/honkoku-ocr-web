import type { Language } from '../../hooks/useLang'

interface HeaderProps {
  lang: Language
  onToggleLanguage: () => void
  onOpenSettings: () => void
  onLogoClick: () => void
}

export function Header({ lang, onToggleLanguage, onOpenSettings, onLogoClick }: HeaderProps) {
  return (
    <header className="header">
      <button className="header-title" onClick={onLogoClick}>
        <img className="header-logo" src={`${import.meta.env.BASE_URL}soramaru/01_normal.png`} alt="" />
        <h1>みんなで翻刻OCR</h1>
        <span className="header-subtitle">
          {lang === 'ja' ? '市民の力で作ったくずし字AI-OCR' : 'Kuzushiji AI-OCR built by citizen scholars'}
        </span>
      </button>
      <div className="header-actions">
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
