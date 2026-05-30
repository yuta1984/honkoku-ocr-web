import type { Language } from '../../hooks/useLang'

interface HeaderProps {
  lang: Language
  onToggleLanguage: () => void
  onOpenSettings: () => void
  onLogoClick: () => void
}

export function Header({ lang, onToggleLanguage, onOpenSettings, onLogoClick }: HeaderProps) {
  const base = import.meta.env.BASE_URL
  return (
    <header className="header">
      <button className="header-title" onClick={onLogoClick}>
        <img className="header-logo" src={`${base}soramaru/01_normal.png`} alt="" />
        <h1>みんなで翻刻OCR</h1>
        <span className="header-subtitle">
          {lang === 'ja' ? '市民の力で作ったくずし字AI-OCR' : 'Kuzushiji AI-OCR powered by citizen scholars'}
        </span>
      </button>
      <div className="header-actions">
        <a className="btn-header-link" href={`${base}about.html`} target="_blank" rel="noopener noreferrer">
          {lang === 'ja' ? '本アプリについて' : 'About'}
        </a>
        <a className="btn-header-link" href={`${base}tech.html`} target="_blank" rel="noopener noreferrer">
          {lang === 'ja' ? '技術情報' : 'Technical Details'}
        </a>
        <a className="btn-header-link" href="https://honkoku.org/" target="_blank" rel="noopener noreferrer">
          {lang === 'ja' ? 'みんなで翻刻' : 'Minna de Honkoku'}
        </a>
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
