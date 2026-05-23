/**
 * レイアウト検出モジュール（koten-layout YOLO）
 * 参照実装: koten-layout-detector/src/inference.js
 *
 * モデル: NDL-DocL 古典籍 5 クラス YOLO
 *   入力 : [1, 3, 640, 640]  レターボックス(pad=114) + RGB/255, NCHW
 *   出力 : [1, 4+5, 8400]    cx,cy,w,h(640px) + クラス別スコア×5
 *   クラス: 0=全体 1=手書き 2=活字 3=図版 4=印判
 *
 * 「手書き」「活字」のボックスがそのまま行(列)に対応するため、
 * これらを行として OCR・読み順推定に渡す（投影分割は不要）。
 */

import type * as OrtType from 'onnxruntime-web'
import { ort, createSession } from './onnx-config'
import { LAYOUT_CLASS } from '../types/ocr'
import type { LineBox, RegionBox, LayoutResult } from '../types/ocr'

const MODEL_SIZE = 640
const PAD_COLOR = 114

const LINE_CLASSES = new Set<number>([LAYOUT_CLASS.HANDWRITTEN, LAYOUT_CLASS.TYPOGRAPHY])

interface Meta {
  scale: number
  padX: number
  padY: number
  origW: number
  origH: number
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

  async initialize(modelData: ArrayBuffer): Promise<void> {
    if (this.initialized) return
    this.session = await createSession(modelData)
    this.initialized = true
    console.log(`[LayoutDetector] koten-layout YOLO ready (${MODEL_SIZE}×${MODEL_SIZE})`)
  }

  async detect(
    imageData: ImageData,
    confThreshold = 0.3,
    iouThreshold = 0.45
  ): Promise<LayoutResult> {
    if (!this.initialized || !this.session) {
      throw new Error('Layout detector not initialized')
    }

    const { tensor, meta } = this.preprocess(imageData)
    const inputName = this.session.inputNames[0]
    const output = await this.session.run({ [inputName]: tensor })
    const outputTensor = output[this.session.outputNames[0]]

    const dets = this.postprocess(outputTensor, meta, confThreshold, iouThreshold)

    const lines: LineBox[] = []
    const regions: RegionBox[] = []
    for (const d of dets) {
      const x = Math.max(0, Math.round(d.x1))
      const y = Math.max(0, Math.round(d.y1))
      const width = Math.min(meta.origW, Math.round(d.x2)) - x
      const height = Math.min(meta.origH, Math.round(d.y2)) - y
      if (width < 6 || height < 6) continue

      if (LINE_CLASSES.has(d.classId)) {
        lines.push({ x, y, width, height, confidence: d.conf, classId: d.classId, readingOrder: 0 })
      } else {
        regions.push({ x, y, width, height, confidence: d.conf, classId: d.classId })
      }
    }

    console.log(`[LayoutDetector] ${lines.length} lines, ${regions.length} regions`)
    return { lines, regions }
  }

  // --- 前処理: レターボックス -> Float32 NCHW /255 -----------------------
  private preprocess(imageData: ImageData): { tensor: OrtType.Tensor; meta: Meta } {
    const src = new OffscreenCanvas(imageData.width, imageData.height)
    src.getContext('2d')!.putImageData(imageData, 0, 0)

    const canvas = new OffscreenCanvas(MODEL_SIZE, MODEL_SIZE)
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = `rgb(${PAD_COLOR},${PAD_COLOR},${PAD_COLOR})`
    ctx.fillRect(0, 0, MODEL_SIZE, MODEL_SIZE)

    const scale = Math.min(MODEL_SIZE / imageData.width, MODEL_SIZE / imageData.height)
    const newW = Math.round(imageData.width * scale)
    const newH = Math.round(imageData.height * scale)
    const padX = Math.floor((MODEL_SIZE - newW) / 2)
    const padY = Math.floor((MODEL_SIZE - newH) / 2)
    ctx.drawImage(src, 0, 0, imageData.width, imageData.height, padX, padY, newW, newH)

    const { data } = ctx.getImageData(0, 0, MODEL_SIZE, MODEL_SIZE)
    const pixelCount = MODEL_SIZE * MODEL_SIZE
    const float32 = new Float32Array(3 * pixelCount)
    for (let i = 0; i < pixelCount; i++) {
      float32[i] = data[i * 4] / 255.0
      float32[i + pixelCount] = data[i * 4 + 1] / 255.0
      float32[i + pixelCount * 2] = data[i * 4 + 2] / 255.0
    }

    return {
      tensor: new ort.Tensor('float32', float32, [1, 3, MODEL_SIZE, MODEL_SIZE]),
      meta: { scale, padX, padY, origW: imageData.width, origH: imageData.height },
    }
  }

  // --- 後処理: [1, 4+nc, 8400] -> 検出 + NMS ----------------------------
  private postprocess(
    outputTensor: OrtType.Tensor,
    meta: Meta,
    confThreshold: number,
    iouThreshold: number
  ): RawDet[] {
    const [, numChannels, numPreds] = outputTensor.dims
    const data = outputTensor.data as Float32Array
    const nc = numChannels - 4 // クラス数（=5）

    const raw: RawDet[] = []
    for (let i = 0; i < numPreds; i++) {
      let maxScore = -Infinity
      let classId = 0
      for (let c = 0; c < nc; c++) {
        const score = data[(4 + c) * numPreds + i]
        if (score > maxScore) {
          maxScore = score
          classId = c
        }
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

  // クラスごとに Non-Maximum Suppression
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

  dispose(): void {
    this.session?.release()
    this.session = null
    this.initialized = false
  }
}
