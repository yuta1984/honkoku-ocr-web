interface AboutDialogProps {
  lang: 'ja' | 'en'
  onClose: () => void
  githubUrl?: string
}

export function AboutDialog({ lang, onClose, githubUrl = 'https://github.com/yuta1984/honkoku-ocr-web' }: AboutDialogProps) {
  return (
    <div className="panel-overlay" onClick={onClose}>
      <div className="panel about-panel" onClick={(e) => e.stopPropagation()}>
        <div className="panel-header">
          <h2>{lang === 'ja' ? 'みんなで翻刻OCRについて' : 'About Minna de Honkoku OCR'}</h2>
          <button className="btn-close" onClick={onClose} aria-label="close">✕</button>
        </div>
        <div className="panel-body about-body">
          <div className="about-hero">
            <img src={`${import.meta.env.BASE_URL}soramaru/07_happy.png`} alt="" />
          </div>
          <section className="about-section">
            <h3 className="about-heading">{lang === 'ja' ? '概要' : 'Overview'}</h3>
            {lang === 'ja' ? (
              <>
                <p>
                  「みんなで翻刻OCR」は、くずし字で書かれた歴史資料を対象としたAI-OCRシステムです。
                  歴史資料の市民参加型翻刻プラットフォーム
                  「<a href="https://app.honkoku.org/" target="_blank" rel="noopener noreferrer">みんなで翻刻</a>」
                  で入力された
                  <strong>5,700万字の翻刻文（<a href="https://github.com/yuta1984/honkoku-data" target="_blank" rel="noopener noreferrer">honkoku-data</a>）と、みんなで翻刻上の資料画像から切り出された120万行の行画像</strong>
                  を用いてくずし字の読み方を学習しています。
                </p>
                <p>
                  くずし字認識AIには既に{' '}
                  <a href="https://codh.rois.ac.jp/miwo/" target="_blank" rel="noopener noreferrer">miwo</a>・
                  <a href="https://camera.fuminoha.jp/" target="_blank" rel="noopener noreferrer">古文書カメラ</a>・
                  <a href="https://lab.ndl.go.jp/data_set/lite-usage/" target="_blank" rel="noopener noreferrer">NDL古典籍OCR</a>
                  {' '}など数々の優れたシステムが公開されています。
                  その中でみんなで翻刻OCRの特徴は、<strong>ふりがなや漢文の訓点などの注釈情報を識別できること</strong>です。
                  みんなで翻刻ではふりがなや漢文の訓点を表記するために
                  「<a href="https://koji-lang.org/" target="_blank" rel="noopener noreferrer">Koji</a>」
                  という簡易マークアップ言語が用いられており、みんなで翻刻OCRもこの形式でふりがなや訓点を出力します。
                </p>
              </>
            ) : (
              <>
                <p>
                  Minna de Honkoku OCR is an AI-OCR system for historical documents written in <em>kuzushiji</em> (cursive Japanese).
                  It is trained on the citizen-driven transcription platform{' '}
                  <a href="https://app.honkoku.org/" target="_blank" rel="noopener noreferrer">Minna de Honkoku</a>:{' '}
                  <strong>57 million characters of transcribed text (<a href="https://github.com/yuta1984/honkoku-data" target="_blank" rel="noopener noreferrer">honkoku-data</a>) and 1.2 million line-level images cropped from its corpus</strong>.
                </p>
                <p>
                  Several excellent kuzushiji OCR systems exist (
                  <a href="https://codh.rois.ac.jp/miwo/" target="_blank" rel="noopener noreferrer">miwo</a>,{' '}
                  <a href="https://camera.fuminoha.jp/" target="_blank" rel="noopener noreferrer">Kobunsho Camera</a>,{' '}
                  <a href="https://lab.ndl.go.jp/data_set/lite-usage/" target="_blank" rel="noopener noreferrer">NDL Kotenseki OCR</a>, etc.).
                  What sets this system apart is that <strong>it recognizes annotation information such as furigana and kanbun reading marks (kunten)</strong>.
                  Minna de Honkoku uses a lightweight markup language{' '}
                  <a href="https://koji-lang.org/" target="_blank" rel="noopener noreferrer">Koji</a>{' '}
                  for these annotations, and this OCR outputs them in the same format.
                </p>
              </>
            )}
          </section>

          <section className="about-section">
            <h3 className="about-heading">{lang === 'ja' ? '使い方' : 'How to use'}</h3>
            {lang === 'ja' ? (
              <ol className="about-steps">
                <li>「画像を追加」ボタンなどからテキスト化したい画像を登録してください（複数登録可能）。</li>
                <li>「レイアウト認識」を実行し、行の位置や読み順を確定してください。手動で調整することもできます。</li>
                <li>「OCR実行」ボタンを押し、処理が完了するまでお待ちください。結果は右側の翻刻パネルに表示されます。</li>
              </ol>
            ) : (
              <ol className="about-steps">
                <li>Register images via the “Add images” button (multiple images supported).</li>
                <li>Run “Layout” to detect line positions and reading order. You can adjust them manually.</li>
                <li>Click “OCR” and wait for processing to finish. Results appear in the transcription panel on the right.</li>
              </ol>
            )}
          </section>

          <section className="about-section">
            <h3 className="about-heading">{lang === 'ja' ? '注意' : 'Notes'}</h3>
            <p>
              {lang === 'ja'
                ? '低解像度画像では認識精度が大きく下がる場合があります。できるだけ高解像度の画像をご使用ください。'
                : 'Recognition accuracy may drop significantly on low-resolution images. Please use high-resolution images whenever possible.'}
            </p>
          </section>

          <section className="about-section">
            <h3 className="about-heading">{lang === 'ja' ? 'お問い合わせ' : 'Contact'}</h3>
            <p>
              {lang === 'ja' ? 'みんなで翻刻サポート窓口: ' : 'Minna de Honkoku support: '}
              <code>support[at]honkoku.org</code>
            </p>
          </section>

          <section className="about-section">
            <h3 className="about-heading">{lang === 'ja' ? '免責事項' : 'Disclaimer'}</h3>
            {lang === 'ja' ? (
              <>
                <p>
                  本アプリが出力するOCR結果はAIによる推定であり、誤りを含む可能性があります。
                  研究・出版など重要な用途で利用される際は、必ず人手による校正を行ってください。
                  本アプリの利用により生じたいかなる損害についても、開発者および関係機関は一切の責任を負いません。
                </p>
                <p>
                  本アプリは<a href="https://www.npmjs.com/package/onnxruntime-web" target="_blank" rel="noopener noreferrer">ONNX Web Runtime</a>を用いてWebブラウザ内で完結して動作します。
                  選択した画像とOCR結果は外部に送信されません。
                </p>
              </>
            ) : (
              <>
                <p>
                  OCR results produced by this app are AI estimates and may contain errors.
                  Always perform human proofreading when the output will be used for research, publication, or other critical purposes.
                  The developer and affiliated institutions assume no responsibility for any damage arising from use of this app.
                </p>
                <p>
                  This app runs entirely in your browser using{' '}
                  <a href="https://www.npmjs.com/package/onnxruntime-web" target="_blank" rel="noopener noreferrer">ONNX Web Runtime</a>.
                  Your images and OCR results are never transmitted externally.
                </p>
              </>
            )}
          </section>

          <section className="about-section about-meta">
            <p>
              {lang === 'ja' ? (
                <>
                  開発:{' '}
                  <a href="https://x.com/yuta1984" target="_blank" rel="noopener noreferrer">橋本雄太</a>
                  （国立歴史民俗博物館、国立国会図書館 非常勤調査員）
                  　/　<a href={githubUrl} target="_blank" rel="noopener noreferrer">GitHub ↗</a>
                </>
              ) : (
                <>
                  Developed by{' '}
                  <a href="https://x.com/yuta1984" target="_blank" rel="noopener noreferrer">Yuta Hashimoto</a>
                  {' '}(National Museum of Japanese History / NDL)
                  　/　<a href={githubUrl} target="_blank" rel="noopener noreferrer">GitHub ↗</a>
                </>
              )}
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
