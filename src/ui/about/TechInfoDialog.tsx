import type { CSSProperties } from 'react'

interface TechInfoDialogProps {
  lang: 'ja' | 'en'
  onClose: () => void
}

// 評価セクションのホスト別 CER（テスト 62,354 行、kana-fold 統一、n≥300）
type HostRow = { ja: string; en: string; host: string; n: number; cer: string }
const HOSTS: HostRow[] = [
  { ja: '福井県デジタルアーカイブ', en: 'Fukui Prefectural Digital Archives', host: 'www.digital-archives.pref.fukui.lg.jp', n: 4935, cer: '0.075' },
  { ja: '京都大学附属図書館', en: 'Kyoto University Library', host: 'rmda.kulib.kyoto-u.ac.jp', n: 803, cer: '0.082' },
  { ja: '国立国会図書館', en: 'National Diet Library', host: 'dl.ndl.go.jp', n: 23891, cer: '0.083' },
  { ja: '東京大学附属図書館', en: 'University of Tokyo Library', host: 'iiif.dl.itc.u-tokyo.ac.jp', n: 7550, cer: '0.083' },
  { ja: 'ADEAC', en: 'ADEAC', host: 'dcfs.trc-adeac.co.jp', n: 1566, cer: '0.084' },
  { ja: '琉球大学附属図書館', en: 'University of the Ryukyus Library', host: 'shimuchi.lib.u-ryukyu.ac.jp', n: 1293, cer: '0.089' },
  { ja: '国立国会図書館（旧系統）', en: 'National Diet Library (legacy)', host: 'www.dl.ndl.go.jp', n: 1533, cer: '0.098' },
  { ja: '国立歴史民俗博物館', en: 'National Museum of Japanese History', host: 'khirin-a.rekihaku.ac.jp', n: 5094, cer: '0.116' },
  { ja: 'amane project', en: 'amane project', host: 'ourarchives.amane-project.jp', n: 6420, cer: '0.125' },
  { ja: '九州大学附属図書館', en: 'Kyushu University Library', host: 'catalog.lib.kyushu-u.ac.jp', n: 971, cer: '0.137' },
  { ja: '東京学芸大学附属図書館', en: 'Tokyo Gakugei University Library', host: 'd-archive.u-gakugei.ac.jp', n: 798, cer: '0.140' },
  { ja: '国文学研究資料館', en: 'National Institute of Japanese Literature', host: 'kokusho.nijl.ac.jp', n: 1864, cer: '0.151' },
  { ja: '国文学研究資料館 古典籍', en: 'NIJL Classical Books', host: 'kotenseki.nijl.ac.jp', n: 1187, cer: '0.151' },
  { ja: '個人/小規模配信サーバ', en: 'Individual / small-scale server', host: 'os3-373-19774.vs.sakura.ne.jp', n: 2407, cer: '0.168' },
  { ja: 'CONTENTdm', en: 'CONTENTdm', host: 'cdm16028.contentdm.oclc.org', n: 1184, cer: '0.227' },
  { ja: '上記以外の小規模ホスト 6 件（まとめて）', en: '6 other small hosts (combined)', host: '', n: 856, cer: '0.083' },
]

const cellLeft: CSSProperties = { padding: '4px 8px', borderBottom: '1px solid #e5e7eb', textAlign: 'left' }
const cellRight: CSSProperties = { padding: '4px 8px', borderBottom: '1px solid #e5e7eb', textAlign: 'right' }
const headStyle: CSSProperties = { padding: '6px 8px', borderBottom: '2px solid #cbd5e1', textAlign: 'left', background: '#f8fafc', fontWeight: 600 }
const headStyleRight: CSSProperties = { ...headStyle, textAlign: 'right' }
const hostMono: CSSProperties = { fontSize: '0.82em', color: '#6b7280', display: 'block' }

export function TechInfoDialog({ lang, onClose }: TechInfoDialogProps) {
  return (
    <div className="panel-overlay" onClick={onClose}>
      <div className="panel about-panel" onClick={(e) => e.stopPropagation()}>
        <div className="panel-header">
          <h2>{lang === 'ja' ? '技術情報' : 'Technical Details'}</h2>
          <button className="btn-close" onClick={onClose} aria-label="close">✕</button>
        </div>
        <div className="panel-body about-body">
          {lang === 'ja' ? (
            <>
              <section className="about-section">
                <p>
                  「みんなで翻刻OCR」は、くずし字で書かれた古典籍の画像から、本文の翻刻に加え、
                  ふりがな・送り仮名・返り点・割書（双行注記）といった<strong>注釈構造を含む電子テキスト</strong>を
                  一括して生成するOCRシステムです。出力は単純な文字列ではなく、原文に備わる注釈関係を
                  タグで保持した構造化テキストとなっており、後段の組版表示・検索・二次利用に適した形式に
                  なっています。以下、データセット・前処理・モデル構成・学習・評価・推論時の工夫について
                  順を追って述べます。
                </p>
              </section>

              <section className="about-section">
                <h3 className="about-heading">データセットの由来</h3>
                <p>
                  学習データは、市民参加型の翻刻プラットフォーム
                  <strong>「<a href="https://app.honkoku.org/" target="_blank" rel="noopener noreferrer">みんなで翻刻</a>」</strong>
                  （2017年公開、国立歴史民俗博物館・京都大学などの研究グループが運営）で公開されている
                  翻刻成果に由来します。同プラットフォームには、国立国会図書館、国文学研究資料館、
                  東京大学附属図書館、京都大学附属図書館、国立歴史民俗博物館、福井県デジタルアーカイブ、
                  琉球大学附属図書館をはじめとする複数の所蔵機関の IIIF デジタルアーカイブから提供された
                  古典籍画像が登録されており、ボランティアの翻刻者の方々がそれらに翻刻と注釈
                  （ふりがな・返り点等）を付与しています。
                </p>
                <p>
                  本研究では、利用許諾が確認できる範囲の翻刻データから、行ごとの位置情報（IIIF Image API
                  上の座標）と翻刻テキストを組み合わせて、<strong>行画像と翻刻文の組をおよそ 120 万件</strong>抽出し、
                  独自の <code>webdataset_v3</code> 形式に整備しました。学習・検証・テストへの分割は書名
                  （entryId）のハッシュで決定的に行っており、同じ書物の異なる行が学習側とテスト側に
                  混在しないため、<strong>書物単位での汎化性能</strong>を評価できます。
                </p>
              </section>

              <section className="about-section">
                <h3 className="about-heading">データ前処理</h3>
                <p>
                  翻刻文には「みんなで翻刻」独自の記法が用いられています。例えば「漢字（かんじ）」や
                  「《振り仮名：漢字｜かんじ》」でふりがな、「￣ニ」や「［ニ］」で送り仮名、「＿レ」や
                  「｛レ｝」で返り点、「《割書：右｜左》」で割書を表現するものです。学習に先立ち、これらを
                  すべて、<code>&lt;ruby&gt;</code> <code>&lt;rt&gt;</code> <code>&lt;OKURI&gt;</code> <code>&lt;KAERI&gt;</code> <code>&lt;WARI&gt;</code> といった
                  <strong>学習用の特殊トークンへ正規化</strong>します。さらに、翻刻者によって表記が揺れがちな仮名
                  （同じ助詞が資料ごとに「ニ」と「に」で書かれるなど）を統一するため、
                  <strong>孤立した1字のカタカナをひらがなへ畳み込む</strong>処理や、
                  kyujipy の 464 字対応表に基づく旧字体→新字体への統一処理を加えています。書物ごと・
                  翻刻者ごとの表記揺れを抑え、文字認識本来の難しさだけが学習信号として残るようにする
                  狙いです。
                </p>
              </section>

              <section className="about-section">
                <h3 className="about-heading">モデル構成</h3>
                <p>
                  行認識モデルは、画像から構造化文字列を生成する<strong>Vision-Encoder-Decoder 型の
                  ニューラルネットワーク</strong>で、HuggingFace の <code>VisionEncoderDecoderModel</code> 枠組みを
                  基盤に実装しています。
                </p>
                <p>
                  エンコーダには、画像認識で標準的に用いられる畳み込みネットワークである
                  <strong>ConvNeXt</strong> の Base 規模（パラメータ約 88M、ImageNet-22k および 1k で事前学習済み）を
                  採用しました。縦書きの 1 行画像を 90° 回転して横長化したうえで、高さ 128px・幅最大
                  1024px にアスペクト比保持でリサイズして入力します。内部の累積ストライドが 32 なので、
                  最終段で<strong>縦 4×横 32 の特徴マップ</strong>（1024 次元のベクトルが計 128 個並んだもの）が
                  得られます。これに対し、<strong>「行内のどの位置（縦・横のどのマス）の特徴か」を示す
                  学習可能な 2 次元位置埋め込み</strong>を独自に追加しました（行方向 8 マス分、列方向 40 マス分の
                  埋め込みを用意して該当位置を加算し、LayerNorm を適用）。縦書き行を横長化しているため、
                  横軸が読み方向に対応します。位置情報をエンコーダ側で明示的に注入することで、長い行でも
                  デコーダのクロスアテンションが行末まで安定して走査できるようにしています。
                </p>
                <p>
                  デコーダには <strong>RoBERTa</strong> をベースとした小型 Transformer（6 層、隠れ次元 512、ヘッド数 8）を
                  用いました。同コーパスで事前に MLM（Masked Language Model）学習を行ったうえで本タスクに
                  転用しており、クロスアテンション部分は OCR タスクで新規に学習させています。文頭トークン
                  <code>&lt;CLS&gt;</code> から文末トークン <code>&lt;SEP&gt;</code> まで、1 トークンずつ次を予測する自己回帰生成です。
                  語彙は BPE で構築した 5,000 トークンで、本文文字に加えて
                  <strong>ふりがな・返り点・送り仮名・割書を表す 11 種類の特殊トークンを同居</strong>させています。
                  この設計により、文字認識と注釈付与を<strong>ひとつの生成過程で同時に</strong>行えるのが
                  本研究の特徴です。
                </p>
              </section>

              <section className="about-section">
                <h3 className="about-heading">学習</h3>
                <p>
                  最適化器は AdamW を用い、(1) 新規初期化部（2D 位置埋め込みとエンコーダ・デコーダ間
                  射影層）、(2) エンコーダ本体、(3) デコーダの 3 群に学習率を分けて与えました
                  （順に 3×10⁻⁴、4×10⁻⁵、5×10⁻⁶）。混合精度（bfloat16 autocast）で、有効バッチサイズ 64・
                  約 85,000 ステップ（おおむね 5 エポック）を、単機の NVIDIA A100 で学習しました。
                </p>
                <p>
                  損失関数は、ラベルスムージング 0.1 付きのクロスエントロピーに、
                  <strong>構造トークンへの重み 2.0</strong> を加えた重み付き CE 損失を用いています。
                  出現頻度の低い返り点と送り仮名はそのままでは学習信号が弱いため、これらを含む行を
                  学習ストリーム上で<strong>2 倍にサンプリング</strong>しました。データ拡張としては
                  albumentations による弾性歪み・形態学的変換（線の太さ揺らぎ）・ガウシアンノイズ・
                  解像度低下・JPEG 圧縮劣化などをランダムに適用し、撮影条件や紙の状態の違いに
                  頑健なモデルを目指しています。
                </p>
              </section>

              <section className="about-section">
                <h3 className="about-heading">評価</h3>
                <p>
                  書物単位で分割したテスト集合（約 <strong>62,000 行</strong>）に対し、kana 表記の揺れを正規化したうえで
                  評価したところ、<strong>本文の文字単位正答率はおよそ 90%</strong> でした。注釈に関する指標は、
                  ふりがなを「どの漢字に付けるか」の判定で約 87%、「読みの内容まで含めた一致」で約 78%、
                  返り点で約 82%、送り仮名で約 61%（いずれも F1）の水準で再現できています。
                </p>
                <p>
                  なお本研究では、構造トークンの評価には、領域内の文字列を連結して編集距離を取る
                  <strong>領域 CER</strong> ではなく、<strong>トークンの多重集合一致による F1</strong> を用いるべきであるという
                  方法論上の知見を得ました。領域 CER は、漢文の返り点が密に並ぶ行で 1 か所のずれが指標
                  全体を大きく歪めるなど、構造評価では誤解を生む振る舞いを示します。F1 は順序非依存で
                  外れ値にも頑健で、より実態に即した値を返します。
                </p>
                <p>
                  所蔵機関ごとの精度を見ると、字体・版面の難易度や撮影条件の違いがそのまま現れます。
                  テスト集合に占める各ホスト（IIIF の画像配信元、便宜上「ホスト」と呼びます）の件数と
                  本文の plain micro CER は次のとおりです（n ≥ 300 のホストのみ抜粋、全体の重み付き
                  平均は <strong>0.102</strong>）。
                </p>
                <div style={{ overflowX: 'auto', margin: '8px 0' }}>
                  <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.95em' }}>
                    <thead>
                      <tr>
                        <th style={headStyle}>所蔵元（IIIF ホスト）</th>
                        <th style={headStyleRight}>件数</th>
                        <th style={headStyleRight}>CER</th>
                      </tr>
                    </thead>
                    <tbody>
                      {HOSTS.map((h) => (
                        <tr key={h.ja}>
                          <td style={cellLeft}>
                            {h.ja}
                            {h.host && <code style={hostMono}>{h.host}</code>}
                          </td>
                          <td style={cellRight}>{h.n.toLocaleString()}</td>
                          <td style={cellRight}>{h.cer}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p>
                  最大件数である国立国会図書館の標本で 0.083、コーパス全体の最良値が福井県
                  デジタルアーカイブの 0.075 と良好な一方、国文学研究資料館の古典籍系では 0.15 前後と
                  差があり、字体や版面の難しさの幅がはっきり現れています。最も精度が落ちる
                  <code>cdm16028.contentdm.oclc.org</code> や <code>os3-…-sakura.ne.jp</code> は、画像品質や対象資料が他と
                  異なる外れ値的な存在であり、今後個別に分析・対処していく対象です。
                </p>
              </section>

              <section className="about-section">
                <h3 className="about-heading">推論時の工夫</h3>
                <p>
                  学習済みモデルは <strong>ONNX</strong> 形式に変換し、<code>quantize_dynamic</code> による
                  動的 int8 量子化で軽量化しました（エンコーダ約 89 MB、デコーダ約 29 MB）。これを
                  ブラウザの WebAssembly 実行環境（onnxruntime-web）で動作させています。
                </p>
                <p>
                  推論時には、いくつかの後処理を組み合わせています。第一に、撮影で生じる行の微小な
                  傾きを<strong>投影プロファイル法</strong>で行ごとに推定し、補正してから認識に渡す処理。第二に、
                  生成中の系列が同一トークンや短周期パターンで反復し始めた場合（行末崩壊）に打ち切る
                  安全機構です。
                </p>
              </section>

              <section className="about-section">
                <h3 className="about-heading">今後の課題</h3>
                <p>
                  撮影解像度が低い資料、字形の崩れが極端な資料、また割書のように 1 行に二段組で書かれた
                  要素には、現状でも誤認識が残ります。学習時の入力解像度を高めること（特に 2 列構成の
                  割書は解像度律速で改善余地が大きいこと）、そして対象資料に合わせた追加学習による改善を、
                  次の段階として予定しています。
                </p>
              </section>
            </>
          ) : (
            <>
              <section className="about-section">
                <p>
                  Minna de Honkoku OCR is an OCR system that, given a cursive Japanese (<em>kuzushiji</em>)
                  classical book image, generates not only the body text transcription but also the
                  surrounding annotation structure&mdash;<em>furigana</em> (ruby readings), <em>okurigana</em>
                  and <em>kaeriten</em> (Japanese-style reading marks for Chinese-text passages), and
                  <em> warigaki</em> (interlinear two-column notes). The output is structured text with tags
                  preserving these annotation relations, making downstream typesetting, search, and reuse
                  straightforward. The following sections describe the dataset, preprocessing, model
                  architecture, training, evaluation, and inference-time refinements.
                </p>
              </section>

              <section className="about-section">
                <h3 className="about-heading">Dataset Provenance</h3>
                <p>
                  Training data is sourced from
                  {' '}<strong><a href="https://app.honkoku.org/" target="_blank" rel="noopener noreferrer">Minna de Honkoku</a></strong>,
                  a citizen-driven transcription platform launched in 2017 and operated by a research
                  group at the National Museum of Japanese History, Kyoto University, and others.
                  The platform hosts classical-book images from the IIIF digital archives of multiple
                  holding institutions, including the National Diet Library, National Institute of
                  Japanese Literature, University of Tokyo Library, Kyoto University Library, National
                  Museum of Japanese History, Fukui Prefectural Digital Archives, and University of the
                  Ryukyus Library. Volunteer transcribers attach transcription and annotations
                  (furigana, kaeriten, etc.) to those images.
                </p>
                <p>
                  From the licensed portion of these transcriptions, we paired per-line position
                  information (coordinates on the IIIF Image API) with transcription text and extracted
                  approximately <strong>1.2 million line-image / transcription pairs</strong>, organizing
                  them into our custom <code>webdataset_v3</code> format. Train/validation/test splits are
                  deterministic by a hash of the title (entryId), so different lines from the same book
                  never cross splits&mdash;the system is evaluated for <strong>book-level generalization</strong>.
                </p>
              </section>

              <section className="about-section">
                <h3 className="about-heading">Data Preprocessing</h3>
                <p>
                  Transcriptions use a notation specific to Minna de Honkoku. For example,
                  &ldquo;漢字（かんじ）&rdquo; or &ldquo;《振り仮名：漢字｜かんじ》&rdquo; encode furigana;
                  &ldquo;￣ニ&rdquo; or &ldquo;［ニ］&rdquo; encode okurigana; &ldquo;＿レ&rdquo; or
                  &ldquo;｛レ｝&rdquo; encode kaeriten; and &ldquo;《割書：右｜左》&rdquo; encodes warigaki.
                  As a first step, all of these are <strong>normalized into special training tokens</strong>:
                  <code> &lt;ruby&gt;</code>, <code>&lt;rt&gt;</code>, <code>&lt;OKURI&gt;</code>, <code>&lt;KAERI&gt;</code>, <code>&lt;WARI&gt;</code>,
                  and so on. To absorb kana-orthographic variation across transcribers (the same particle
                  written as &ldquo;ニ&rdquo; in one source and &ldquo;に&rdquo; in another), we
                  <strong> fold isolated single-character katakana into hiragana</strong>, and also unify
                  464 classical-form (<em>kyujitai</em>) characters to their modern (<em>shinjitai</em>)
                  counterparts via the kyujipy mapping. This keeps book- and transcriber-specific
                  surface variation out of the learning signal, leaving the genuine difficulty of
                  character recognition as the residual.
                </p>
              </section>

              <section className="about-section">
                <h3 className="about-heading">Model Architecture</h3>
                <p>
                  The line recognizer is a <strong>Vision-Encoder-Decoder neural network</strong> that
                  generates structured text from images, implemented on top of HuggingFace&rsquo;s
                  <code> VisionEncoderDecoderModel</code> framework.
                </p>
                <p>
                  The encoder uses <strong>ConvNeXt</strong> at the Base scale (~88M parameters,
                  pretrained on ImageNet-22k and ImageNet-1k). Each vertical line is rotated 90&deg; to a
                  horizontal orientation and resized (aspect-preserving) to height 128px and width up to
                  1024px. With a cumulative stride of 32, the encoder produces a
                  <strong> 4&times;32 feature map</strong> (128 vectors of 1024 dimensions). On top of this we
                  add a custom <strong>learned 2D positional embedding</strong> indicating &ldquo;which
                  row and column of the line is this feature from&rdquo; (8 row embeddings and 40 column
                  embeddings; we add the appropriate row and column embeddings to each cell and apply
                  LayerNorm). Because vertical lines are rotated to horizontal, the horizontal axis
                  corresponds to the reading direction. Injecting positional information explicitly on
                  the encoder side helps decoder cross-attention sweep stably to the end of long lines.
                </p>
                <p>
                  The decoder is a small <strong>RoBERTa</strong>-based Transformer (6 layers, hidden
                  size 512, 8 heads). It is initialized from a model previously pretrained with masked
                  language modeling (MLM) on the same corpus and adapted to OCR; the cross-attention is
                  trained from scratch for the OCR task. It generates autoregressively, one token at a
                  time, from <code>&lt;CLS&gt;</code> until <code>&lt;SEP&gt;</code>. The vocabulary is a BPE
                  with 5,000 tokens that <strong>colocates 11 structural special tokens</strong>
                  (for furigana, kaeriten, okurigana, and warigaki) alongside ordinary characters,
                  so that character recognition and annotation tagging happen
                  <strong> jointly in a single generation pass</strong>&mdash;a key feature of this work.
                </p>
              </section>

              <section className="about-section">
                <h3 className="about-heading">Training</h3>
                <p>
                  Optimization uses AdamW with three learning-rate groups: (1) newly initialized
                  modules (2D positional embedding and the encoder&ndash;decoder projection),
                  (2) the encoder backbone, and (3) the decoder, with learning rates
                  3&times;10<sup>&minus;4</sup>, 4&times;10<sup>&minus;5</sup>, and 5&times;10<sup>&minus;6</sup>{' '}
                  respectively. Training runs in bfloat16 autocast with effective batch size 64 for
                  about 85,000 steps (~5 epochs) on a single NVIDIA A100.
                </p>
                <p>
                  The loss is cross-entropy with label smoothing 0.1, augmented with
                  <strong> weighted CE (weight 2.0 on structural tokens)</strong>. Because rare annotations
                  like kaeriten and okurigana provide weaker learning signal at their natural frequency,
                  we <strong>oversample lines containing them by 2&times;</strong> in the training stream.
                  Data augmentation via albumentations randomly applies elastic distortion, morphological
                  operations (varying stroke thickness), Gaussian noise, resolution reduction, and JPEG
                  compression artifacts, targeting robustness to imaging conditions and paper state.
                </p>
              </section>

              <section className="about-section">
                <h3 className="about-heading">Evaluation</h3>
                <p>
                  On a book-level test split of about <strong>62,000 lines</strong>, with kana variation
                  normalized, <strong>plain text CER is approximately 0.10 (~90% character-level
                  accuracy)</strong>. For annotation tagging, F1 reaches ~87% for &ldquo;which kanji
                  receives furigana,&rdquo; ~78% for &ldquo;exact (kanji, reading) pair match,&rdquo; ~82%
                  for kaeriten, and ~61% for okurigana.
                </p>
                <p>
                  As a methodological observation, structural tokens are best evaluated with
                  <strong> multiset-token F1</strong> rather than region CER (the latter concatenates
                  in-region characters and computes edit distance). Region CER is unstable on lines
                  densely packed with kaeriten, where a single misalignment can distort the metric.
                  F1 is order-invariant and outlier-robust, and gives a more realistic picture.
                </p>
                <p>
                  Accuracy varies by holding institution, reflecting differences in handwriting,
                  print layout, and imaging conditions. Per-host plain micro CER (hosts with n &ge; 300,
                  weighted average <strong>0.102</strong>):
                </p>
                <div style={{ overflowX: 'auto', margin: '8px 0' }}>
                  <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.95em' }}>
                    <thead>
                      <tr>
                        <th style={headStyle}>Holding institution (IIIF host)</th>
                        <th style={headStyleRight}>n</th>
                        <th style={headStyleRight}>CER</th>
                      </tr>
                    </thead>
                    <tbody>
                      {HOSTS.map((h) => (
                        <tr key={h.en}>
                          <td style={cellLeft}>
                            {h.en}
                            {h.host && <code style={hostMono}>{h.host}</code>}
                          </td>
                          <td style={cellRight}>{h.n.toLocaleString()}</td>
                          <td style={cellRight}>{h.cer}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p>
                  The dominant National Diet Library sample (n = 23,891) shows 0.083, and the best
                  overall result is Fukui Prefectural Digital Archives at 0.075. By contrast,
                  NIJL Classical Books and related sources sit around 0.15, indicating a meaningful
                  spread in script and layout difficulty. The worst-performing hosts
                  (<code>cdm16028.contentdm.oclc.org</code>, <code>os3-&hellip;-sakura.ne.jp</code>) are outliers
                  in image quality and material; these warrant individual analysis going forward.
                </p>
              </section>

              <section className="about-section">
                <h3 className="about-heading">Inference</h3>
                <p>
                  The trained model is exported to <strong>ONNX</strong> and compressed via
                  <code> quantize_dynamic</code> (dynamic int8 quantization), giving an encoder of about
                  89 MB and a decoder of about 29 MB. These are executed in the browser&rsquo;s
                  WebAssembly environment using <em>onnxruntime-web</em>.
                </p>
                <p>
                  Several post-processing steps run at inference time. First, small per-line tilts
                  from imaging are estimated with a <strong>projection-profile method</strong> and
                  corrected before recognition. Second, a safety guard terminates generation if the
                  output begins repeating the same token or a short cyclic pattern (an end-of-line
                  collapse).
                </p>
              </section>

              <section className="about-section">
                <h3 className="about-heading">Future Work</h3>
                <p>
                  Low-resolution images, severely deformed scripts, and warigaki
                  (two-column inline notes) remain failure modes. We plan to raise the training
                  resolution&mdash;particularly important for warigaki, which is resolution-bound by its
                  two-column packing&mdash;and to perform targeted additional training on specific
                  source materials.
                </p>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
