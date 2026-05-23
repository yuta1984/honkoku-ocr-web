interface FooterProps {
  lang: 'ja' | 'en'
  githubUrl?: string
}

export function Footer({ lang, githubUrl = 'https://github.com/yuta1984' }: FooterProps) {
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
            くずし字行OCRモデル(ConvNeXt + RoBERTa, v7) と古典籍レイアウト検出モデルを ONNX に変換して使用しています。
            翻刻データは「{' '}
            <a href="https://honkoku.org" target="_blank" rel="noopener noreferrer">みんなで翻刻</a>
            {' '}」に基づきます。
          </span>
        ) : (
          <span className="footer-attribution-text">
            Uses an ONNX-ported kuzushiji line-OCR model (ConvNeXt + RoBERTa, v7) and a classical-document layout detector,
            trained on data from{' '}
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
      </div>
    </footer>
  )
}
