interface FooterProps {
  lang: 'ja' | 'en'
  githubUrl?: string
  onHide?: () => void
}

export function Footer({ lang, githubUrl = 'https://github.com/yuta1984', onHide }: FooterProps) {
  return (
    <footer className="footer">
      <div className="footer-privacy">
        <span className="privacy-icon">🔒</span>
        {lang === 'ja' ? (
          <span>
            本アプリは{' '}
            <a href="https://www.npmjs.com/package/onnxruntime-web" target="_blank" rel="noopener noreferrer">
              ONNX Web Runtime
            </a>{' '}
            技術により Webブラウザ内で完結して動作します。選択した画像とOCR結果はあなたのPCの外部には送信されません。
          </span>
        ) : (
          <span>
            This app runs entirely in your browser via{' '}
            <a href="https://www.npmjs.com/package/onnxruntime-web" target="_blank" rel="noopener noreferrer">
              ONNX Web Runtime
            </a>
            . Your images and OCR results never leave your computer.
          </span>
        )}
      </div>
      <div className="footer-attribution">
        {lang === 'ja' ? (
          <span className="footer-attribution-text">
            低解像度画像では認識精度が大きく下がる場合があります。
            翻刻データは「{' '}
            <a href="https://honkoku.org" target="_blank" rel="noopener noreferrer">みんなで翻刻</a>
            {' '}」に基づきます。
          </span>
        ) : (
          <span className="footer-attribution-text">
            Recognition accuracy may drop significantly on low-resolution images. Transcription data is based on{' '}
            <a href="https://honkoku.org" target="_blank" rel="noopener noreferrer">Minna de Honkoku</a>.
          </span>
        )}
      </div>
      <div className="footer-meta">
        <span className="footer-author">
          {lang === 'ja' ? (
            <>
              作成者:{' '}
              <a href="https://x.com/yuta1984" target="_blank" rel="noopener noreferrer">橋本雄太</a>
              （国立歴史民俗博物館、国立国会図書館 非常勤調査員）
            </>
          ) : (
            <>
              Created by{' '}
              <a href="https://x.com/yuta1984" target="_blank" rel="noopener noreferrer">Yuta Hashimoto</a>
              {' '}(National Museum of Japanese History / NDL)
            </>
          )}
        </span>
        <a href={githubUrl} target="_blank" rel="noopener noreferrer" className="footer-github">
          {lang === 'ja' ? 'GitHub' : 'GitHub'} ↗
        </a>
        {onHide && (
          <button className="footer-close" onClick={onHide} title={lang === 'ja' ? '閉じる' : 'Hide'} aria-label="hide footer">×</button>
        )}
      </div>
    </footer>
  )
}
