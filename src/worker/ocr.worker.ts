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
import { loadModel } from './model-loader'
import { LayoutDetector } from './layout-detector'
import { ReadingOrderProcessor } from './reading-order'
import type { WorkerInMessage, WorkerOutMessage } from '../types/worker'

class LayoutWorker {
  private detector: LayoutDetector | null = null
  private readingOrder = new ReadingOrderProcessor()
  private initialized = false

  private post(message: WorkerOutMessage) {
    self.postMessage(message)
  }

  async initialize(): Promise<void> {
    if (this.initialized) return
    try {
      const progresses = { layout: 0, encoder: 0, decoder: 0 }
      const report = () => {
        const avg = (progresses.layout + progresses.encoder + progresses.decoder) / 3
        this.post({
          type: 'INIT_PROGRESS',
          progress: avg,
          message: `モデルをダウンロード中... ${Math.round(avg * 100)}%`,
          modelProgress: { ...progresses },
        })
      }

      // 3 モデルを並列ダウンロード（IndexedDB へキャッシュ）
      const [layoutData] = await Promise.all([
        loadModel('layout', (p) => { progresses.layout = p; report() }),
        loadModel('ocrEncoder', (p) => { progresses.encoder = p; report() }),
        loadModel('ocrDecoder', (p) => { progresses.decoder = p; report() }),
      ])

      this.post({ type: 'INIT_PROGRESS', progress: 0.98, message: 'レイアウトモデルを準備中...' })
      this.detector = new LayoutDetector()
      await this.detector.initialize(layoutData)

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
