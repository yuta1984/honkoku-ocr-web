/**
 * 文字認識モジュール（kuzushiji v7: ConvNeXt エンコーダ + RoBERTa デコーダ, greedy）
 * 参照実装: demo_onnx_v7.py（to_pixel / greedy_onnx）
 *
 * パイプライン（1 行ぶん）:
 *   行crop -> to_pixel[1,3,128,1024] -> encoder -> encoder_hidden_states[1,128,D]
 *   -> greedy: input_ids=[CLS] から SEP まで逐次デコード -> Koji トークン列(生文字列)
 *
 * 前処理 to_pixel は学習時 eval transform と完全一致させる:
 *   1. 幅>120 なら左 45px を crop（隣接行の混入除去）
 *   2. 縦長なら 90度時計回り回転（PIL rotate(-90, expand) と等価）
 *   3. 高さ128 にアスペクト比保持リサイズ、幅は最大1024
 *   4. 幅 < 1024 は右側を白(255)パディング
 *   5. /255 後 ImageNet 平均/分散で正規化、NCHW
 */

import type * as OrtType from 'onnxruntime-web'
import { ort, createSession } from './onnx-config'
import type { OcrModelVersion } from './model-loader'
import { DEFAULT_OCR_VERSION } from './model-loader'

const IMG_H = 128
const IMG_W = 1024
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

// 語彙(id→token)は **モデルの版ごとに異なる**（v7 と v8 で token id の並びが ~86% 違う）。
// 版に対応した vocab を読まないと全文字が別字に化けるので、版で URL を切り替える。
// v7 = kuzushiji-vocab.json（既存）、v8 = kuzushiji-vocab-v8.json。
const vocabUrl = (version: OcrModelVersion) =>
  `${import.meta.env.BASE_URL}config/kuzushiji-vocab${version === 'v7' ? '' : `-${version}`}.json`

export class TextRecognizer {
  private encoder: OrtType.InferenceSession | null = null
  private decoder: OrtType.InferenceSession | null = null
  private vocab: string[] = []
  private initialized = false

  async initialize(
    encoderData: ArrayBuffer,
    decoderData: ArrayBuffer,
    version: OcrModelVersion = DEFAULT_OCR_VERSION
  ): Promise<void> {
    if (this.initialized) return
    if (this.vocab.length === 0) {
      const res = await fetch(vocabUrl(version))
      if (!res.ok) throw new Error(`Failed to load vocab: ${res.statusText}`)
      this.vocab = await res.json()
    }
    // WASM ランタイムが 1 スレッドのためセッション作成は直列
    this.encoder = await createSession(encoderData)
    this.decoder = await createSession(decoderData)
    this.initialized = true
  }

  /** 行 crop（ImageData）-> Koji トークン列の生文字列（<ruby>… 等のタグ込み） */
  async recognizeCropped(crop: ImageData): Promise<string> {
    if (!this.initialized || !this.encoder || !this.decoder) {
      throw new Error('Text recognizer not initialized')
    }

    const pixelValues = this.toPixel(crop)
    const encOut = await this.encoder.run({ [this.encoder.inputNames[0]]: pixelValues })
    const encoderHidden = encOut[this.encoder.outputNames[0]]

    const decInNames = this.decoder.inputNames
    const idsName = decInNames.find((n) => n.includes('input_ids')) ?? decInNames[0]
    const encName = decInNames.find((n) => n.includes('encoder')) ?? decInNames[1]
    const outName = this.decoder.outputNames[0]

    const seq: number[] = [CLS]
    const generated: number[] = []
    for (let step = 0; step < MAX_LEN; step++) {
      const idsTensor = new ort.Tensor('int64', BigInt64Array.from(seq.map((v) => BigInt(v))), [1, seq.length])
      const out = await this.decoder.run({ [idsName]: idsTensor, [encName]: encoderHidden })
      const logits = out[outName]
      const [, , vocabSize] = logits.dims
      const data = logits.data as Float32Array
      // 最終ステップ位置のロジット argmax
      const base = (seq.length - 1) * vocabSize
      let best = 0
      let bestVal = -Infinity
      for (let v = 0; v < vocabSize; v++) {
        const val = data[base + v]
        if (val > bestVal) {
          bestVal = val
          best = v
        }
      }
      if (best === SEP) break
      seq.push(best)
      generated.push(best)
      // 崩壊ガード: 末尾が短周期で反復し始めたら、反復の1周期だけ残して打ち切る
      const p = TextRecognizer.degeneratePeriod(generated)
      if (p > 0) { generated.length -= REPEAT_WINDOW - p; break }
    }

    return this.decode(generated)
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
    out = out.replace(/<rt2>.*?<\/rt2>/g, '').replace(/<\/?rt2>/g, '')
    return out
  }

  // --- to_pixel: 学習 eval transform 完全一致（先頭で per-line deskew） ---
  private toPixel(crop: ImageData): OrtType.Tensor {
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

    // 3. 高さ128 にアスペクト比保持リサイズ（幅は最大1024）
    const nw = Math.max(1, Math.min(IMG_W, Math.round((w * IMG_H) / h)))
    const resized = new OffscreenCanvas(nw, IMG_H)
    const rctx2 = resized.getContext('2d')!
    rctx2.imageSmoothingEnabled = true
    rctx2.imageSmoothingQuality = 'high'
    rctx2.drawImage(canvas, 0, 0, w, h, 0, 0, nw, IMG_H)

    // 4. 右側を白パディングして 1024×128 に
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
    this.encoder = null
    this.decoder = null
    this.initialized = false
  }
}
