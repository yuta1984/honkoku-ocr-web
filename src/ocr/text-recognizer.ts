/**
 * 文字認識モジュール（ConvNeXt エンコーダ + RoBERTa デコーダ, greedy）
 *
 * パイプライン（1 行ぶん）:
 *   行crop -> to_pixel[1,3,H,W] -> encoder -> encoder_hidden_states[1,S,D]
 *   -> greedy: input_ids=[CLS] から SEP まで逐次デコード -> Koji トークン列(生文字列)
 *
 * 版ごとの差:
 *   - v7/v8/v11: H=128, W=1024, S=128(8×16), decoder 単一 / use_cache=false で都度全シーケンス
 *   - v12     : H=192, W=1536, S=288(6×48), decoder は prefill+step / KVキャッシュ
 *               (初回 CLS を prefill に通して KV 構築 → 以降 step に 1 token + past_kv を渡す)
 *
 * 前処理 to_pixel は学習 eval transform と完全一致:
 *   1. 幅>120 なら左 45px を crop（隣接行の混入除去）
 *   2. 縦長なら 90度時計回り回転（PIL rotate(-90, expand) と等価）
 *   3. 高さ H にアスペクト比保持リサイズ、幅は最大 W
 *   4. 幅 < W は右側を白(255)パディング
 *   5. /255 後 ImageNet 平均/分散で正規化、NCHW
 */

import type * as OrtType from 'onnxruntime-web'
import { ort, createSession } from './onnx-config'
import type { OcrModelVersion } from './model-loader'
import { DEFAULT_OCR_VERSION, HAS_KV_CACHE_DECODER } from './model-loader'

const CLS = 2
const SEP = 3
const STRUCT = new Set([0, 1, 2, 3, 4]) // <PAD> <UNK> <CLS> <SEP> <MASK>
// 生成トークン上限。学習ターゲットは 256 トークン、評価(dump)は 192 生成。80 だと
// 長い行＋ふりがな(1語で <ruby>X<rt>yomi</rt></ruby>≈9トークン消費)で末尾が切れるため 192 に合わせる。
const MAX_LEN = 192
// 行末の崩壊(同一/短周期トークンの連鎖)を打ち切るガード。直近 REPEAT_WINDOW トークンが
// 周期 ≤4 で反復していたら停止。12連続は通常文では起こらず、崩壊のみを捕捉する。
const REPEAT_WINDOW = 12
const LEFT_CROP_PX = 45
const MIN_W_FOR_CROP = 120

// per-line deskew（傾き補正）パラメータ
const SKEW_MAX_DEG = 12      // 探索する最大傾き角(±)
const SKEW_COARSE_DEG = 3    // 粗探索ステップ
const SKEW_MIN_APPLY = 2     // この角度未満は補正しない（直立行のジッタ防止）
const SKEW_DOWNSCALE = 120   // 角度推定用のダウンスケール上限(px)

// ImageNet 正規化
const MEAN = [0.485, 0.456, 0.406]
const STD = [0.229, 0.224, 0.225]

// 版別の入力解像度。v13 は 256×2048(8:1 維持)、v12 は 192×1536、v7/v8/v11 は 128×1024。
const IMG_DIMS: Record<OcrModelVersion, { h: number; w: number }> = {
  v7:  { h: 128, w: 1024 },
  v8:  { h: 128, w: 1024 },
  v11: { h: 128, w: 1024 },
  v12: { h: 192, w: 1536 },
  v13: { h: 256, w: 2048 },
}

// v12 decoder の KV キャッシュ層数。RoBERTa(512/6/8) → 6 layers, 各 layer に
// (self_k, self_v, cross_k, cross_v) の 4 テンソル = 24 テンソル/方向。
const V12_NUM_LAYERS = 6

// 語彙(id→token)は **モデルの版ごとに異なる**（v7 と v8/v11/v12 で token id の並びが ~86% 違う）。
// 版に対応した vocab を読まないと全文字が別字に化けるので、版で URL を切り替える。
// v7 = kuzushiji-vocab.json（既存）、v8/v11/v12 = kuzushiji-vocab-{ver}.json。v12 の vocab は v11 と完全一致だが
// 版選択 UI と独立に保てるよう別ファイル扱いにする。
const vocabUrl = (version: OcrModelVersion) =>
  `${import.meta.env.BASE_URL}config/kuzushiji-vocab${version === 'v7' ? '' : `-${version}`}.json`

// ひらがな(U+3041–U+3096) → カタカナ(+0x60)。長音符・反復記号・漢字は範囲外なので不変。
const hiraToKata = (s: string): string =>
  s.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60))

type InitArgs =
  | { version: OcrModelVersion; encoderData: ArrayBuffer; decoderData: ArrayBuffer }                       // v7/v8/v11
  | { version: OcrModelVersion; encoderData: ArrayBuffer; prefillData: ArrayBuffer; stepData: ArrayBuffer } // v12

export class TextRecognizer {
  private encoder: OrtType.InferenceSession | null = null
  private decoder: OrtType.InferenceSession | null = null
  private decoderPrefill: OrtType.InferenceSession | null = null
  private decoderStep: OrtType.InferenceSession | null = null
  private vocab: string[] = []
  private initialized = false
  private version: OcrModelVersion = DEFAULT_OCR_VERSION
  private imgH = IMG_DIMS[DEFAULT_OCR_VERSION].h
  private imgW = IMG_DIMS[DEFAULT_OCR_VERSION].w
  // v12 step の input/output 名キャッシュ
  private stepPastNames: string[] = []
  private stepPresentNames: string[] = []

  async initialize(args: InitArgs): Promise<void> {
    if (this.initialized) return
    this.version = args.version
    const dims = IMG_DIMS[args.version]
    this.imgH = dims.h
    this.imgW = dims.w
    if (this.vocab.length === 0) {
      const res = await fetch(vocabUrl(args.version))
      if (!res.ok) throw new Error(`Failed to load vocab: ${res.statusText}`)
      this.vocab = await res.json()
    }
    // WASM ランタイムが 1 スレッドのためセッション作成は直列
    this.encoder = await createSession(args.encoderData)
    if (HAS_KV_CACHE_DECODER(args.version) && 'prefillData' in args) {
      this.decoderPrefill = await createSession(args.prefillData)
      this.decoderStep    = await createSession(args.stepData)
      // step の past_/present_ 入出力名を順序込みで取り出す(レイヤ順)。
      this.stepPastNames    = this.decoderStep.inputNames.filter((n) => n.startsWith('past_'))
      this.stepPresentNames = this.decoderStep.outputNames.filter((n) => n.startsWith('present_'))
      if (this.stepPastNames.length !== V12_NUM_LAYERS * 4) {
        throw new Error(`v12 step expects ${V12_NUM_LAYERS * 4} past tensors, got ${this.stepPastNames.length}`)
      }
    } else if ('decoderData' in args) {
      this.decoder = await createSession(args.decoderData)
    } else {
      throw new Error(`Inconsistent init args for version ${args.version}`)
    }
    this.initialized = true
  }

  /** 行 crop（ImageData）-> Koji トークン列の生文字列（<ruby>… 等のタグ込み） */
  async recognizeCropped(crop: ImageData): Promise<string> {
    if (!this.initialized || !this.encoder) throw new Error('Text recognizer not initialized')
    const pixelValues = this.toPixel(crop)
    const encOut = await this.encoder.run({ [this.encoder.inputNames[0]]: pixelValues })
    const encoderHidden = encOut[this.encoder.outputNames[0]]
    const generated = HAS_KV_CACHE_DECODER(this.version)
      ? await this.greedyKvCache(encoderHidden)
      : await this.greedyFullSeq(encoderHidden)
    return this.decode(generated)
  }

  /** v7/v8/v11: 毎ステップ全シーケンスを decoder へ渡す。KV キャッシュなし。 */
  private async greedyFullSeq(encoderHidden: OrtType.Tensor): Promise<number[]> {
    const dec = this.decoder
    if (!dec) throw new Error('decoder not initialized')
    const decInNames = dec.inputNames
    const idsName = decInNames.find((n) => n.includes('input_ids')) ?? decInNames[0]
    const encName = decInNames.find((n) => n.includes('encoder')) ?? decInNames[1]
    const outName = dec.outputNames[0]
    const seq: number[] = [CLS]
    const generated: number[] = []
    for (let step = 0; step < MAX_LEN; step++) {
      const idsTensor = new ort.Tensor('int64', BigInt64Array.from(seq.map((v) => BigInt(v))), [1, seq.length])
      const out = await dec.run({ [idsName]: idsTensor, [encName]: encoderHidden })
      const logits = out[outName]
      const [, , vocabSize] = logits.dims
      const data = logits.data as Float32Array
      const base = (seq.length - 1) * vocabSize
      let best = 0, bestVal = -Infinity
      for (let v = 0; v < vocabSize; v++) {
        const val = data[base + v]
        if (val > bestVal) { bestVal = val; best = v }
      }
      if (best === SEP) break
      seq.push(best)
      generated.push(best)
      const p = TextRecognizer.degeneratePeriod(generated)
      if (p > 0) { generated.length -= REPEAT_WINDOW - p; break }
    }
    return generated
  }

  /**
   * v12: KV キャッシュ greedy。初回 [CLS] を prefill に通して logits + present_kv を得る。
   * 以降 step を 1 token ずつ呼び、past_kv を世代間で持ち回る。
   * cross K/V は prefill 出力後は不変だが、step も present_cross を返すので前ステップの
   * present をそのまま次ステップの past に渡せばよい（再計算コストはほぼゼロ）。
   */
  private async greedyKvCache(encoderHidden: OrtType.Tensor): Promise<number[]> {
    const prefill = this.decoderPrefill
    const step = this.decoderStep
    if (!prefill || !step) throw new Error('v12 decoder (prefill/step) not initialized')

    // 1. prefill: input_ids=[CLS] + encoder_hidden → logits + present_*
    const clsIds = new ort.Tensor('int64', BigInt64Array.from([BigInt(CLS)]), [1, 1])
    const pre = await prefill.run({ input_ids: clsIds, encoder_hidden_states: encoderHidden })
    const preLogits = pre.logits as OrtType.Tensor
    let bestId = TextRecognizer.argmaxLast(preLogits)
    if (bestId === SEP) return []
    const generated: number[] = [bestId]
    // 次ステップ用の past_* を present_* から作る（layer 順は present_names = past_names で完全一致）
    let pastKv: Record<string, OrtType.Tensor> = {}
    for (let i = 0; i < this.stepPresentNames.length; i++) {
      pastKv[this.stepPastNames[i]] = pre[this.stepPresentNames[i]] as OrtType.Tensor
    }

    // 2. step ループ。past_self_* は 1 token ずつ伸び、past_cross_* は不変。
    for (let s = 1; s < MAX_LEN; s++) {
      const idsTensor = new ort.Tensor('int64', BigInt64Array.from([BigInt(bestId)]), [1, 1])
      const feeds: Record<string, OrtType.Tensor> = {
        input_ids: idsTensor,
        encoder_hidden_states: encoderHidden,
        ...pastKv,
      }
      const out = await step.run(feeds)
      bestId = TextRecognizer.argmaxLast(out.logits as OrtType.Tensor)
      if (bestId === SEP) break
      generated.push(bestId)
      // 次ステップの past = 今ステップの present
      const next: Record<string, OrtType.Tensor> = {}
      for (let i = 0; i < this.stepPresentNames.length; i++) {
        next[this.stepPastNames[i]] = out[this.stepPresentNames[i]] as OrtType.Tensor
      }
      pastKv = next
      const p = TextRecognizer.degeneratePeriod(generated)
      if (p > 0) { generated.length -= REPEAT_WINDOW - p; break }
    }
    return generated
  }

  /** logits[1, T, V] の最終位置 argmax を返す（KV cache 版でも prefill 出力長は T=1 なので汎用）。 */
  private static argmaxLast(logits: OrtType.Tensor): number {
    const [, T, V] = logits.dims
    const data = logits.data as Float32Array
    const base = (T - 1) * V
    let best = 0, bestVal = -Infinity
    for (let v = 0; v < V; v++) {
      const val = data[base + v]
      if (val > bestVal) { bestVal = val; best = v }
    }
    return best
  }

  /**
   * 直近 REPEAT_WINDOW トークンが周期 p(1..4) で反復していれば p を返す（崩壊判定）。
   * 反復していなければ 0。通常文では 12 トークンの短周期反復は起きないため誤検出しにくい。
   */
  private static degeneratePeriod(seq: number[]): number {
    if (seq.length < REPEAT_WINDOW) return 0
    const start = seq.length - REPEAT_WINDOW
    for (let p = 1; p <= 4; p++) {
      let periodic = true
      for (let i = start; i < seq.length - p; i++) {
        if (seq[i] !== seq[i + p]) { periodic = false; break }
      }
      if (periodic) return p
    }
    return 0
  }

  /** トークンID列 -> 生文字列（特殊構造トークン以外は語彙文字列をそのまま連結） */
  private decode(ids: number[]): string {
    let out = ''
    for (const id of ids) {
      if (STRUCT.has(id)) continue
      out += this.vocab[id] ?? ''
    }
    // <rt2>（第2読み）はモデルの過剰付与が支配的（test gold 34 件に対し v11 は ~1300 件、
    // 大半が読みの“両賭け”で重複）。除去するとふりがな精度が改善する（領域CER 0.148→0.117 で検証）。
    // gold での出現は極稀なので全版で一律除去する。末尾切れの孤立タグも掃除。
    // ※ v12 は学習側で KOJI_NO_RT2=1 のため出現自体ほぼ無いが、念のため除去を残す。
    out = out.replace(/<rt2>.*?<\/rt2>/g, '').replace(/<\/?rt2>/g, '')
    // 漢文の送り仮名・返り点はカタカナが慣例。学習前処理が孤立カタカナをひらがなへ畳むため
    // v11 はこれらをひらがなで出力する → 送り仮名(<OKURI>)・返点(<KAERI> と生＿）の仮名のみ
    // カタカナへ戻す。本文や <rt> ふりがなは対象外なので一般のひらがな表記は壊さない。
    out = out
      .replace(/<OKURI>(.*?)<\/OKURI>/g, (_, b) => `<OKURI>${hiraToKata(b)}</OKURI>`)
      .replace(/<KAERI>(.*?)<\/KAERI>/g, (_, b) => `<KAERI>${hiraToKata(b)}</KAERI>`)
      .replace(/＿([ぁ-ゖ]+)/g, (_, b) => `＿${hiraToKata(b)}`)
    return out
  }

  // --- to_pixel: 学習 eval transform 完全一致（先頭で per-line deskew） ---
  private toPixel(crop: ImageData): OrtType.Tensor {
    const IMG_H = this.imgH, IMG_W = this.imgW
    // 0. 行ごとの傾き補正（投影プロファイル法）。直立行(|角|<閾値)は補正しない。
    const angle = this.estimateSkewAngle(crop)
    const work = Math.abs(angle) >= SKEW_MIN_APPLY ? TextRecognizer.rotateImageData(crop, angle) : crop

    let w = work.width
    let h = work.height

    // 元画像を OffscreenCanvas に
    let canvas = new OffscreenCanvas(w, h)
    const ctx = canvas.getContext('2d')!
    ctx.putImageData(work, 0, 0)

    // 1. 左 45px crop（幅 > 120 のとき）
    if (w > MIN_W_FOR_CROP) {
      const cw = w - LEFT_CROP_PX
      const cropped = new OffscreenCanvas(cw, h)
      cropped.getContext('2d')!.drawImage(canvas, LEFT_CROP_PX, 0, cw, h, 0, 0, cw, h)
      canvas = cropped
      w = cw
    }

    // 2. 縦長 -> 90度時計回り回転（PIL rotate(-90, expand=True) 相当）
    if (h > w) {
      const rotated = new OffscreenCanvas(h, w) // 幅=元高さ, 高さ=元幅
      const rctx = rotated.getContext('2d')!
      rctx.translate(h, 0)
      rctx.rotate(Math.PI / 2)
      rctx.drawImage(canvas, 0, 0)
      canvas = rotated
      const t = w
      w = h
      h = t
    }

    // 3. 高さ IMG_H にアスペクト比保持リサイズ（幅は最大 IMG_W）
    const nw = Math.max(1, Math.min(IMG_W, Math.round((w * IMG_H) / h)))
    const resized = new OffscreenCanvas(nw, IMG_H)
    const rctx2 = resized.getContext('2d')!
    rctx2.imageSmoothingEnabled = true
    rctx2.imageSmoothingQuality = 'high'
    rctx2.drawImage(canvas, 0, 0, w, h, 0, 0, nw, IMG_H)

    // 4. 右側を白パディングして IMG_W × IMG_H に
    const final = new OffscreenCanvas(IMG_W, IMG_H)
    const fctx = final.getContext('2d')!
    fctx.fillStyle = 'rgb(255,255,255)'
    fctx.fillRect(0, 0, IMG_W, IMG_H)
    fctx.drawImage(resized, 0, 0)

    // 5. /255 -> ImageNet 正規化 -> NCHW
    const { data } = fctx.getImageData(0, 0, IMG_W, IMG_H)
    const plane = IMG_W * IMG_H
    const tensorData = new Float32Array(3 * plane)
    for (let i = 0; i < plane; i++) {
      tensorData[i] = (data[i * 4] / 255.0 - MEAN[0]) / STD[0]
      tensorData[i + plane] = (data[i * 4 + 1] / 255.0 - MEAN[1]) / STD[1]
      tensorData[i + 2 * plane] = (data[i * 4 + 2] / 255.0 - MEAN[2]) / STD[2]
    }

    return new ort.Tensor('float32', tensorData, [1, 3, IMG_H, IMG_W])
  }

  /**
   * 行 crop の傾き角を投影プロファイル法で推定して返す（度, 正負）。
   * 縦書き行は直立時にインクが最も狭い x 幅に集まる → 回転候補ごとに
   * 列和の二乗和 Σcol² を計算し、最大化する角度を直立角とする。
   * （横書き行＝横長 crop の場合は行和 Σrow² で評価。）
   */
  private estimateSkewAngle(crop: ImageData): number {
    const scale = Math.min(1, SKEW_DOWNSCALE / Math.max(crop.width, crop.height))
    const sw = Math.max(8, Math.round(crop.width * scale))
    const sh = Math.max(8, Math.round(crop.height * scale))
    const vertical = crop.height >= crop.width

    const src = new OffscreenCanvas(crop.width, crop.height)
    src.getContext('2d')!.putImageData(crop, 0, 0)
    const small = new OffscreenCanvas(sw, sh)
    const sctx = small.getContext('2d')!
    sctx.imageSmoothingEnabled = true
    sctx.drawImage(src, 0, 0, crop.width, crop.height, 0, 0, sw, sh)

    // 二値化しきい値 = 平均輝度 × 0.9（インク=暗部のみ拾い、地色のベースラインを除く）
    const sd = sctx.getImageData(0, 0, sw, sh).data
    let lumSum = 0
    for (let i = 0; i < sw * sh; i++) {
      lumSum += 0.299 * sd[i * 4] + 0.587 * sd[i * 4 + 1] + 0.114 * sd[i * 4 + 2]
    }
    const thr = (lumSum / (sw * sh)) * 0.9

    const diag = Math.ceil(Math.hypot(sw, sh)) + 2
    const rc = new OffscreenCanvas(diag, diag)
    const rctx = rc.getContext('2d')!

    const score = (deg: number): number => {
      rctx.setTransform(1, 0, 0, 1, 0, 0)
      rctx.fillStyle = '#fff'
      rctx.fillRect(0, 0, diag, diag)
      rctx.translate(diag / 2, diag / 2)
      rctx.rotate((deg * Math.PI) / 180)
      rctx.drawImage(small, -sw / 2, -sh / 2)
      const { data } = rctx.getImageData(0, 0, diag, diag)
      const acc = new Float64Array(diag)
      for (let y = 0; y < diag; y++) {
        for (let x = 0; x < diag; x++) {
          const o = (y * diag + x) * 4
          const lum = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2]
          if (lum < thr) acc[vertical ? x : y]++
        }
      }
      let s = 0
      for (let i = 0; i < diag; i++) s += acc[i] * acc[i]
      return s
    }

    let best = 0
    let bestS = -1
    for (let d = -SKEW_MAX_DEG; d <= SKEW_MAX_DEG; d += SKEW_COARSE_DEG) {
      const s = score(d)
      if (s > bestS) { bestS = s; best = d }
    }
    for (let d = best - SKEW_COARSE_DEG + 1; d <= best + SKEW_COARSE_DEG - 1; d++) {
      if (d === best) continue
      const s = score(d)
      if (s > bestS) { bestS = s; best = d }
    }
    return best
  }

  /** ImageData を deg 度回転（白背景・回転後の外接矩形サイズ）。estimateSkewAngle と同符号。 */
  static rotateImageData(crop: ImageData, deg: number): ImageData {
    const rad = (deg * Math.PI) / 180
    const w = crop.width
    const h = crop.height
    const cos = Math.abs(Math.cos(rad))
    const sin = Math.abs(Math.sin(rad))
    const nw = Math.ceil(w * cos + h * sin)
    const nh = Math.ceil(w * sin + h * cos)

    const src = new OffscreenCanvas(w, h)
    src.getContext('2d')!.putImageData(crop, 0, 0)

    const c = new OffscreenCanvas(nw, nh)
    const ctx = c.getContext('2d')!
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.fillStyle = 'rgb(255,255,255)'
    ctx.fillRect(0, 0, nw, nh)
    ctx.translate(nw / 2, nh / 2)
    ctx.rotate(rad)
    ctx.drawImage(src, -w / 2, -h / 2)
    return ctx.getImageData(0, 0, nw, nh)
  }

  /** フル画像から行領域を一括 crop（sourceCanvas を1回だけ生成して使い回す） */
  static cropLines(
    imageData: ImageData,
    boxes: Array<{ x: number; y: number; width: number; height: number }>
  ): ImageData[] {
    const src = new OffscreenCanvas(imageData.width, imageData.height)
    src.getContext('2d')!.putImageData(imageData, 0, 0)
    return boxes.map((b) => {
      const w = Math.max(1, Math.round(b.width))
      const h = Math.max(1, Math.round(b.height))
      const c = new OffscreenCanvas(w, h)
      const cx = c.getContext('2d')!
      cx.drawImage(src, b.x, b.y, b.width, b.height, 0, 0, w, h)
      return cx.getImageData(0, 0, w, h)
    })
  }

  dispose(): void {
    this.encoder?.release()
    this.decoder?.release()
    this.decoderPrefill?.release()
    this.decoderStep?.release()
    this.encoder = null
    this.decoder = null
    this.decoderPrefill = null
    this.decoderStep = null
    this.initialized = false
  }
}
