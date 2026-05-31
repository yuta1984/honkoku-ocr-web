/**
 * レイアウト検出モジュール（version='rtmdet' / 'yolo' を選択可能）
 *
 *  rtmdet : RTMDet-S 単一クラス行検出器
 *    入力 : [1,3,1024,1024] BGR mean=[103.53,116.28,123.675] std=[57.375,57.12,58.395]
 *           レターボックス(pad=114) で 1024×1024
 *    出力 : dets [1,N,5] (x1,y1,x2,y2,score, 入力座標, NMS済) / labels [1,N] int64
 *    すべて「行」として扱い、classId = HANDWRITTEN を割当（領域クラスは出ない）。
 *
 *  yolo   : NDL-DocL 古典籍 5 クラス YOLOv8
 *    入力 : [1,3,640,640]  /255 のみ。レターボックス(pad=114)
 *    出力 : [1, 4+5, 8400] cx,cy,w,h(640px) + クラス別スコア×5
 *    クラス: 0=全体 1=手書き 2=活字 3=図版 4=印判
 *    「手書き」「活字」=行(行box)、それ以外=領域。JS 側で NMS する。
 */

import type * as OrtType from 'onnxruntime-web'
import { ort, createSession } from './onnx-config'
import { LAYOUT_CLASS } from '../types/ocr'
import type { LineBox, RegionBox, LayoutResult } from '../types/ocr'
import type { LayoutModelVersion } from './model-loader'

const PAD_COLOR = 114
const RTMDET_SIZE = 1024
const YOLO_SIZE = 640
const RTMDET_MEAN_BGR = [103.53, 116.28, 123.675]
const RTMDET_STD_BGR = [57.375, 57.12, 58.395]

const YOLO_LINE_CLASSES = new Set<number>([LAYOUT_CLASS.HANDWRITTEN, LAYOUT_CLASS.TYPOGRAPHY])

interface Meta {
  scale: number
  padX: number
  padY: number
  origW: number
  origH: number
  modelSize: number
}

interface RawDet {
  x1: number
  y1: number
  x2: number
  y2: number
  conf: number
  classId: number
}

export class LayoutDetector {
  private session: OrtType.InferenceSession | null = null
  private initialized = false
  private version: LayoutModelVersion = 'rtmdet'

  async initialize(modelData: ArrayBuffer, version: LayoutModelVersion): Promise<void> {
    if (this.initialized) return
    this.version = version
    this.session = await createSession(modelData)
    this.initialized = true
    const size = version === 'rtmdet' ? RTMDET_SIZE : YOLO_SIZE
    console.log(`[LayoutDetector] ready: ${version} (${size}×${size})`)
  }

  async detect(
    imageData: ImageData,
    confThreshold = 0.3,
    iouThreshold = 0.45,
  ): Promise<LayoutResult> {
    if (!this.initialized || !this.session) {
      throw new Error('Layout detector not initialized')
    }
    return this.version === 'rtmdet'
      ? this.detectRtmdet(imageData, confThreshold)
      : this.detectYolo(imageData, confThreshold, iouThreshold)
  }

  // ----- RTMDet ----------------------------------------------------------

  private async detectRtmdet(imageData: ImageData, confThreshold: number): Promise<LayoutResult> {
    const { tensor, meta } = this.preprocessRtmdet(imageData)
    const inputName = this.session!.inputNames[0]
    const output = await this.session!.run({ [inputName]: tensor })
    const detsTensor = output['dets'] ?? output[this.session!.outputNames[0]]
    const detsData = detsTensor.data as Float32Array
    const numDets = detsTensor.dims[1]

    // 元座標系の bbox を作って、クラス横断 NMS で重複除去する。
    // mmdeploy エクスポート時の NMS は per-class（max_output_boxes_per_class=200）なので、
    // 2 クラス(手書き/活字)で同じ行を別クラスとして残しがち。ここで class-agnostic NMS。
    const raw: RawDet[] = []
    for (let i = 0; i < numDets; i++) {
      const off = i * 5
      const score = detsData[off + 4]
      if (score < confThreshold) continue
      raw.push({
        x1: (detsData[off + 0] - meta.padX) / meta.scale,
        y1: (detsData[off + 1] - meta.padY) / meta.scale,
        x2: (detsData[off + 2] - meta.padX) / meta.scale,
        y2: (detsData[off + 3] - meta.padY) / meta.scale,
        conf: score,
        classId: LAYOUT_CLASS.HANDWRITTEN,
      })
    }
    const merged = this.nmsAgnostic(raw, 0.4, 0.6)

    // 行の読み方向（縦書きでは y、横書きでは x）に余白を付与。
    // ONNX 出力の bbox は字形ぴったりに張り付き、訓練アノテーションも本文中央寄りに
    // タイトに付けられている傾向があるので大きめに：長軸方向は ~10%、短軸方向は ~5%。
    const lines: LineBox[] = []
    for (const d of merged) {
      const w = d.x2 - d.x1
      const h = d.y2 - d.y1
      const vertical = h >= w
      const padLong = Math.max(60, Math.round((vertical ? h : w) * 0.10))
      const padShort = Math.max(20, Math.round((vertical ? w : h) * 0.05))
      const padX = vertical ? padShort : padLong
      const padY = vertical ? padLong : padShort
      const x = Math.max(0, Math.round(d.x1 - padX))
      const y = Math.max(0, Math.round(d.y1 - padY))
      const x2c = Math.min(meta.origW, Math.round(d.x2 + padX))
      const y2c = Math.min(meta.origH, Math.round(d.y2 + padY))
      const width = x2c - x
      const height = y2c - y
      if (width < 6 || height < 6) continue
      lines.push({
        x, y, width, height,
        confidence: d.conf,
        classId: LAYOUT_CLASS.HANDWRITTEN,
        readingOrder: 0,
      })
    }
    console.log(`[LayoutDetector] ${lines.length} lines (rtmdet, dedup ${raw.length}→${merged.length})`)
    return { lines, regions: [] }
  }

  /**
   * クラス横断 NMS。IoU だけでなく IoS（intersection over smaller）も用いる。
   * 通常 NMS（IoU）は「ほぼ同じ大きさで重なる」ケースのみ捕捉するため、
   * 「小さい box が大きい box に内包される」入れ子ケースを取りこぼす。
   * IoS = 交わり面積 / 小さい方の面積 が大きいときも suppress する。
   */
  private nmsAgnostic(dets: RawDet[], iouThreshold: number, iosThreshold: number): RawDet[] {
    const result: RawDet[] = []
    let cands = [...dets].sort((a, b) => b.conf - a.conf)
    while (cands.length > 0) {
      const best = cands.shift()!
      result.push(best)
      const areaBest = (best.x2 - best.x1) * (best.y2 - best.y1)
      cands = cands.filter((c) => {
        const inter = this.interArea(best, c)
        if (inter === 0) return true
        const areaC = (c.x2 - c.x1) * (c.y2 - c.y1)
        const union = areaBest + areaC - inter
        if (inter / union >= iouThreshold) return false   // 通常 IoU NMS
        const ios = inter / Math.min(areaBest, areaC)
        if (ios >= iosThreshold) return false              // 内包ケース
        return true
      })
    }
    return result
  }

  private interArea(a: RawDet, b: RawDet): number {
    const ix1 = Math.max(a.x1, b.x1)
    const iy1 = Math.max(a.y1, b.y1)
    const ix2 = Math.min(a.x2, b.x2)
    const iy2 = Math.min(a.y2, b.y2)
    return Math.max(0, ix2 - ix1) * Math.max(0, iy2 - iy1)
  }

  private preprocessRtmdet(imageData: ImageData): { tensor: OrtType.Tensor; meta: Meta } {
    const { canvas, meta } = this.letterbox(imageData, RTMDET_SIZE)
    const { data } = canvas.getContext('2d')!.getImageData(0, 0, RTMDET_SIZE, RTMDET_SIZE)
    const N = RTMDET_SIZE * RTMDET_SIZE
    const float32 = new Float32Array(3 * N)
    const [mB, mG, mR] = RTMDET_MEAN_BGR
    const [sB, sG, sR] = RTMDET_STD_BGR
    for (let i = 0; i < N; i++) {
      const r = data[i * 4]
      const g = data[i * 4 + 1]
      const b = data[i * 4 + 2]
      // BGR 順で NCHW
      float32[i]         = (b - mB) / sB
      float32[i + N]     = (g - mG) / sG
      float32[i + N * 2] = (r - mR) / sR
    }
    return {
      tensor: new ort.Tensor('float32', float32, [1, 3, RTMDET_SIZE, RTMDET_SIZE]),
      meta,
    }
  }

  // ----- YOLO ------------------------------------------------------------

  private async detectYolo(
    imageData: ImageData,
    confThreshold: number,
    iouThreshold: number,
  ): Promise<LayoutResult> {
    const { tensor, meta } = this.preprocessYolo(imageData)
    const inputName = this.session!.inputNames[0]
    const output = await this.session!.run({ [inputName]: tensor })
    const outputTensor = output[this.session!.outputNames[0]]
    const dets = this.postprocessYolo(outputTensor, meta, confThreshold, iouThreshold)

    const lines: LineBox[] = []
    const regions: RegionBox[] = []
    for (const d of dets) {
      const x = Math.max(0, Math.round(d.x1))
      const y = Math.max(0, Math.round(d.y1))
      const width = Math.min(meta.origW, Math.round(d.x2)) - x
      const height = Math.min(meta.origH, Math.round(d.y2)) - y
      if (width < 6 || height < 6) continue
      if (YOLO_LINE_CLASSES.has(d.classId)) {
        lines.push({ x, y, width, height, confidence: d.conf, classId: d.classId, readingOrder: 0 })
      } else {
        regions.push({ x, y, width, height, confidence: d.conf, classId: d.classId })
      }
    }
    console.log(`[LayoutDetector] ${lines.length} lines, ${regions.length} regions (yolo)`)
    return { lines, regions }
  }

  private preprocessYolo(imageData: ImageData): { tensor: OrtType.Tensor; meta: Meta } {
    const { canvas, meta } = this.letterbox(imageData, YOLO_SIZE)
    const { data } = canvas.getContext('2d')!.getImageData(0, 0, YOLO_SIZE, YOLO_SIZE)
    const N = YOLO_SIZE * YOLO_SIZE
    const float32 = new Float32Array(3 * N)
    for (let i = 0; i < N; i++) {
      float32[i]         = data[i * 4] / 255.0
      float32[i + N]     = data[i * 4 + 1] / 255.0
      float32[i + N * 2] = data[i * 4 + 2] / 255.0
    }
    return {
      tensor: new ort.Tensor('float32', float32, [1, 3, YOLO_SIZE, YOLO_SIZE]),
      meta,
    }
  }

  private postprocessYolo(
    outputTensor: OrtType.Tensor,
    meta: Meta,
    confThreshold: number,
    iouThreshold: number,
  ): RawDet[] {
    const [, numChannels, numPreds] = outputTensor.dims
    const data = outputTensor.data as Float32Array
    const nc = numChannels - 4

    const raw: RawDet[] = []
    for (let i = 0; i < numPreds; i++) {
      let maxScore = -Infinity
      let classId = 0
      for (let c = 0; c < nc; c++) {
        const score = data[(4 + c) * numPreds + i]
        if (score > maxScore) { maxScore = score; classId = c }
      }
      if (maxScore < confThreshold) continue
      const cx = data[i]
      const cy = data[numPreds + i]
      const w = data[2 * numPreds + i]
      const h = data[3 * numPreds + i]
      raw.push({
        x1: ((cx - w / 2) - meta.padX) / meta.scale,
        y1: ((cy - h / 2) - meta.padY) / meta.scale,
        x2: ((cx + w / 2) - meta.padX) / meta.scale,
        y2: ((cy + h / 2) - meta.padY) / meta.scale,
        conf: maxScore,
        classId,
      })
    }
    return this.nms(raw, iouThreshold)
  }

  private nms(dets: RawDet[], iouThreshold: number): RawDet[] {
    const result: RawDet[] = []
    const classIds = [...new Set(dets.map((d) => d.classId))]
    for (const cid of classIds) {
      let boxes = dets.filter((d) => d.classId === cid).sort((a, b) => b.conf - a.conf)
      while (boxes.length > 0) {
        const best = boxes.shift()!
        result.push(best)
        boxes = boxes.filter((b) => this.iou(best, b) < iouThreshold)
      }
    }
    return result
  }

  private iou(a: RawDet, b: RawDet): number {
    const ix1 = Math.max(a.x1, b.x1)
    const iy1 = Math.max(a.y1, b.y1)
    const ix2 = Math.min(a.x2, b.x2)
    const iy2 = Math.min(a.y2, b.y2)
    const inter = Math.max(0, ix2 - ix1) * Math.max(0, iy2 - iy1)
    if (inter === 0) return 0
    const areaA = (a.x2 - a.x1) * (a.y2 - a.y1)
    const areaB = (b.x2 - b.x1) * (b.y2 - b.y1)
    return inter / (areaA + areaB - inter)
  }

  // ----- 共通：レターボックス --------------------------------------------

  private letterbox(imageData: ImageData, size: number): { canvas: OffscreenCanvas; meta: Meta } {
    const src = new OffscreenCanvas(imageData.width, imageData.height)
    src.getContext('2d')!.putImageData(imageData, 0, 0)

    const canvas = new OffscreenCanvas(size, size)
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = `rgb(${PAD_COLOR},${PAD_COLOR},${PAD_COLOR})`
    ctx.fillRect(0, 0, size, size)

    const scale = Math.min(size / imageData.width, size / imageData.height)
    const newW = Math.round(imageData.width * scale)
    const newH = Math.round(imageData.height * scale)
    const padX = Math.floor((size - newW) / 2)
    const padY = Math.floor((size - newH) / 2)
    ctx.drawImage(src, 0, 0, imageData.width, imageData.height, padX, padY, newW, newH)

    return {
      canvas,
      meta: { scale, padX, padY, origW: imageData.width, origH: imageData.height, modelSize: size },
    }
  }

  dispose(): void {
    this.session?.release()
    this.session = null
    this.initialized = false
  }
}
