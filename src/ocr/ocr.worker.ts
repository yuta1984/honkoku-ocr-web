/**
 * レイアウト Worker（単一インスタンス）
 *
 * 役割:
 *   - 初回起動時に 3 モデル(layout / encoder / decoder)を **このワーカーがまとめて
 *     ダウンロードし IndexedDB にキャッシュ** する（N 本の認識ワーカーが同じ巨大
 *     ファイルを並列ダウンロードするのを防ぐ）。
 *   - layout モデルのみセッション化し、LAYOUT_DETECT で行/領域検出 + 読み順推定を行う。
 *   - encoder/decoder のセッション化は各認識ワーカーが（キャッシュ済みデータから）行う。
 */

import './onnx-config'
import { loadModel, DEFAULT_OCR_VERSION, DEFAULT_LAYOUT_VERSION, HAS_KV_CACHE_DECODER } from './model-loader'
import type { OcrModelVersion, LayoutModelVersion } from './model-loader'
import { LayoutDetector } from './layout-detector'
import { ReadingOrderProcessor } from './reading-order'
import type { WorkerInMessage, WorkerOutMessage } from '../types/worker'

class LayoutWorker {
  private detector: LayoutDetector | null = null
  private readingOrder = new ReadingOrderProcessor()
  private initialized = false
  // OCR モデルの版。INITIALIZE で受け取り、認識ワーカーと同じ版をキャッシュさせる。
  version: OcrModelVersion = DEFAULT_OCR_VERSION
  // レイアウト検出モデルの版 (rtmdet / yolo)。INITIALIZE で受け取る。
  layoutVersion: LayoutModelVersion = DEFAULT_LAYOUT_VERSION

  private post(message: WorkerOutMessage) {
    self.postMessage(message)
  }

  async initialize(): Promise<void> {
    if (this.initialized) return
    try {
      // v12 は decoder が prefill+step の2ファイル。ステータスバーは「decoder」として
      // 平均値を 1 つにまとめて表示する（4 ファイル表示は煩雑なため）。
      const splitDec = HAS_KV_CACHE_DECODER(this.version)
      const progresses = { layout: 0, encoder: 0, decoder: 0, decoderPrefill: 0, decoderStep: 0 }
      const decoderAvg = () => splitDec ? (progresses.decoderPrefill + progresses.decoderStep) / 2 : progresses.decoder
      const report = () => {
        const dec = decoderAvg()
        const avg = (progresses.layout + progresses.encoder + dec) / 3
        this.post({
          type: 'INIT_PROGRESS',
          progress: avg,
          message: `モデルをダウンロード中... ${Math.round(avg * 100)}%`,
          modelProgress: { layout: progresses.layout, encoder: progresses.encoder, decoder: dec },
        })
      }

      // モデルを並列ダウンロード(IndexedDB へキャッシュ)。OCR/layout とも version 別。
      const tasks: Promise<unknown>[] = [
        loadModel('layout',     (p) => { progresses.layout = p; report() },  this.version, this.layoutVersion),
        loadModel('ocrEncoder', (p) => { progresses.encoder = p; report() }, this.version, this.layoutVersion),
      ]
      if (splitDec) {
        tasks.push(loadModel('ocrDecoderPrefill', (p) => { progresses.decoderPrefill = p; report() }, this.version, this.layoutVersion))
        tasks.push(loadModel('ocrDecoderStep',    (p) => { progresses.decoderStep    = p; report() }, this.version, this.layoutVersion))
      } else {
        tasks.push(loadModel('ocrDecoder', (p) => { progresses.decoder = p; report() }, this.version, this.layoutVersion))
      }
      const [layoutData] = await Promise.all(tasks) as [ArrayBuffer, ...ArrayBuffer[]]

      this.post({ type: 'INIT_PROGRESS', progress: 0.98, message: 'レイアウトモデルを準備中...' })
      this.detector = new LayoutDetector()
      await this.detector.initialize(layoutData, this.layoutVersion)

      this.initialized = true
      this.post({ type: 'INIT_DONE' })
    } catch (error) {
      this.post({ type: 'INIT_ERROR', error: (error as Error).message })
    }
  }

  async detect(id: string, imageData: ImageData): Promise<void> {
    try {
      if (!this.initialized) await this.initialize()
      const { lines, regions } = await this.detector!.detect(imageData)
      const ordered = this.readingOrder.orderLines(lines)
      this.post({ type: 'LAYOUT_DONE', id, lines: ordered, regions })
    } catch (error) {
      this.post({ type: 'LAYOUT_ERROR', id, error: (error as Error).message })
    }
  }
}

const worker = new LayoutWorker()

self.onmessage = async (event: MessageEvent<WorkerInMessage>) => {
  const msg = event.data
  switch (msg.type) {
    case 'INITIALIZE':
      worker.version = msg.version
      worker.layoutVersion = msg.layoutVersion
      await worker.initialize()
      break
    case 'LAYOUT_DETECT':
      await worker.detect(msg.id, msg.imageData)
      break
    case 'TERMINATE':
      self.close()
      break
  }
}
