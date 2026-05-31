import { useRef, useState, useCallback, useEffect } from 'react'
import type { LayoutResult, LineBox, ModelState } from '../types/ocr'
import type { WorkerInMessage, WorkerOutMessage } from '../types/worker'
import type { RecWorkerInMessage, RecWorkerOutMessage, RecJob } from '../types/recognition-worker'
import type { OcrModelVersion, LayoutModelVersion } from '../ocr/model-loader'
import { cropLines } from '../lib/imageLoader'
import RecognitionWorkerFactory from '../ocr/recognition.worker.ts?worker'

// 認識ワーカー数: CPU 数に応じて増やすが、各ワーカーが encoder+decoder セッションを
// 1 組ずつ持つためメモリ上限として MAX で抑える。
// 環境別の上限:
//   - iOS (iPhone/iPad/iPod) または deviceMemory < 4GB → 1 (タブ毎メモリ上限が厳しい)
//   - その他モバイル (Android 等) → 最大 MOBILE_MAX_REC_WORKERS
//   - デスクトップ → 最大 MAX_REC_WORKERS
const MAX_REC_WORKERS = 8
const MOBILE_MAX_REC_WORKERS = 4
type NavWithMemory = Navigator & { deviceMemory?: number }
const ua = typeof navigator !== 'undefined' ? (navigator.userAgent ?? '') : ''
// iPad は iPadOS 13+ で "MacIntel" Safari に偽装するため、maxTouchPoints も併用して検出
const IS_IOS = /iPhone|iPad|iPod/i.test(ua) || (
  typeof navigator !== 'undefined'
  && (navigator.platform === 'MacIntel' || navigator.platform === 'iPad')
  && (navigator.maxTouchPoints ?? 0) > 1
)
const IS_OTHER_MOBILE_UA = !IS_IOS && /Android|webOS|BlackBerry|IEMobile|Opera Mini|Mobile|Tablet/i.test(ua)
const DEVICE_MEM = (typeof navigator !== 'undefined' ? (navigator as NavWithMemory).deviceMemory : undefined) ?? 8
const IS_LOW_MEM = DEVICE_MEM < 4
const HW_CONCURRENCY = navigator.hardwareConcurrency ?? 4
const N_REC_WORKERS =
  IS_IOS || IS_LOW_MEM
    ? 1
    : IS_OTHER_MOBILE_UA
      ? Math.min(Math.max(HW_CONCURRENCY - 1, 1), MOBILE_MAX_REC_WORKERS)
      : Math.min(Math.max(HW_CONCURRENCY - 1, 1), MAX_REC_WORKERS)

// 行 crop の余白(px)。レイアウト bbox は主文字に密着しており、縦書きでは
// ふりがなが主行の右側にはみ出すため、そのまま切ると ふりがな/字形 が切れる。
// 上下左右に余白を付けて crop する。左の余白は text-recognizer の to_pixel が
// 行う「左45pxクロップ」(v7学習transform由来・隣接行の混入除去)で相殺されるため、
// 実質的に 上・下・右 に余白が付く（＝主文字を削らずに ふりがな を含められる）。
const OCR_CROP_MARGIN = 45

const initialModelState: ModelState = {
  status: 'loading_model',
  progress: 0.02,
  message: '初期化中...',
}

export function useOCRWorker(modelVersion: OcrModelVersion, layoutVersion: LayoutModelVersion) {
  const ocrWorkerRef = useRef<Worker | null>(null)
  const recWorkersRef = useRef<Worker[]>([])
  const [isReady, setIsReady] = useState(false)
  const [modelState, setModelState] = useState<ModelState>(initialModelState)

  // レイアウト要求の保留中 resolver（id -> {resolve, reject}）
  const layoutPending = useRef<Map<string, { resolve: (r: LayoutResult) => void; reject: (e: Error) => void }>>(new Map())

  useEffect(() => {
    // version 変更時はワーカーを作り直す（cleanup で旧ワーカーを終了 → 再初期化）。
    // 前版の ready 状態が残らないようリセットしてから起動する。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsReady(false)
    setModelState(initialModelState)

    const ocrWorker = new Worker(new URL('../ocr/ocr.worker.ts', import.meta.url), { type: 'module' })
    ocrWorkerRef.current = ocrWorker

    const recWorkers = Array.from({ length: N_REC_WORKERS }, () => new RecognitionWorkerFactory())
    recWorkersRef.current = recWorkers
    const pending = layoutPending.current

    let recReadyCount = 0
    const onAllRecReady = () => {
      setModelState({ status: 'ready', progress: 1, message: '準備完了' })
      setIsReady(true)
    }

    const initRecWorkers = () => {
      setModelState({ status: 'loading_model', progress: 0.98, message: '認識モデルを準備中...' })
      recWorkers.forEach((w) => {
        const onReady = (e: MessageEvent<RecWorkerOutMessage>) => {
          if (e.data.type === 'REC_READY') {
            recReadyCount++
            w.removeEventListener('message', onReady)
            if (recReadyCount >= N_REC_WORKERS) onAllRecReady()
          } else if (e.data.type === 'REC_INIT_ERROR') {
            w.removeEventListener('message', onReady)
            setModelState({ status: 'error', progress: 0, message: '認識モデルの初期化に失敗しました', error: e.data.error })
          }
        }
        w.addEventListener('message', onReady)
        w.postMessage({ type: 'REC_INIT', version: modelVersion } satisfies RecWorkerInMessage)
      })
    }

    ocrWorker.onmessage = (event: MessageEvent<WorkerOutMessage>) => {
      const msg = event.data
      switch (msg.type) {
        case 'INIT_PROGRESS':
          setModelState({ status: 'loading_model', progress: msg.progress, message: msg.message, modelProgress: msg.modelProgress })
          break
        case 'INIT_DONE':
          // モデルが IndexedDB にキャッシュされたので、認識ワーカーをキャッシュから初期化
          initRecWorkers()
          break
        case 'INIT_ERROR':
          setModelState({ status: 'error', progress: 0, message: 'モデルの読み込みに失敗しました', error: msg.error })
          break
        case 'LAYOUT_DONE': {
          const pending = layoutPending.current.get(msg.id)
          if (pending) {
            layoutPending.current.delete(msg.id)
            pending.resolve({ lines: msg.lines, regions: msg.regions })
          }
          break
        }
        case 'LAYOUT_ERROR': {
          const pending = layoutPending.current.get(msg.id)
          if (pending) {
            layoutPending.current.delete(msg.id)
            pending.reject(new Error(msg.error))
          }
          break
        }
      }
    }

    // 初期状態は initialModelState（loading_model）。ここでは worker を起動するだけ。
    ocrWorker.postMessage({ type: 'INITIALIZE', version: modelVersion, layoutVersion } satisfies WorkerInMessage)

    return () => {
      ocrWorker.postMessage({ type: 'TERMINATE' } satisfies WorkerInMessage)
      ocrWorker.terminate()
      recWorkers.forEach((w) => {
        w.postMessage({ type: 'REC_TERMINATE' } satisfies RecWorkerInMessage)
        w.terminate()
      })
      ocrWorkerRef.current = null
      recWorkersRef.current = []
      pending.clear()
    }
  }, [modelVersion, layoutVersion])

  /** レイアウト認識（行/領域検出 + 読み順）。読み順付きの行を返す。 */
  const detectLayout = useCallback((imageData: ImageData): Promise<LayoutResult> => {
    return new Promise((resolve, reject) => {
      const worker = ocrWorkerRef.current
      if (!worker) return reject(new Error('Worker not ready'))
      const id = `layout-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      layoutPending.current.set(id, { resolve, reject })
      // imageData は他フェーズでも使うため転送せず構造化クローンで送る
      worker.postMessage({ type: 'LAYOUT_DETECT', id, imageData } satisfies WorkerInMessage)
    })
  }, [])

  /**
   * OCR 認識: 行 crop を N 本の認識ワーカーに分配し、enc-dec greedy で認識。
   * 行インデックス -> Koji 生文字列 の Map を返す。onLineDone は1行完了ごとに呼ぶ。
   */
  const recognizeLines = useCallback(
    (imageData: ImageData, lines: LineBox[], onLineDone?: (done: number, total: number) => void): Promise<Map<number, string>> => {
      return new Promise((resolve, reject) => {
        const workers = recWorkersRef.current
        if (workers.length === 0) return reject(new Error('Recognition workers not ready'))
        if (lines.length === 0) return resolve(new Map())

        // 行 bbox に上下左右の余白を付けて crop（ふりがな/字形の切れを防ぐ）
        const W = imageData.width
        const H = imageData.height
        const padded = lines.map((l) => {
          const x = Math.max(0, l.x - OCR_CROP_MARGIN)
          const y = Math.max(0, l.y - OCR_CROP_MARGIN)
          const right = Math.min(W, l.x + l.width + OCR_CROP_MARGIN)
          const bottom = Math.min(H, l.y + l.height + OCR_CROP_MARGIN)
          return { x, y, width: right - x, height: bottom - y }
        })
        const crops = cropLines(imageData, padded)

        // round-robin で各ワーカーへ分配
        const N = workers.length
        const chunks: RecJob[][] = Array.from({ length: N }, () => [])
        lines.forEach((_, i) => chunks[i % N].push({ id: i, croppedImageData: crops[i] }))

        const total = lines.length
        let done = 0

        const dispatch = (worker: Worker, jobs: RecJob[]): Promise<Array<{ id: number; raw: string }>> =>
          new Promise((res, rej) => {
            if (jobs.length === 0) return res([])
            const handler = (e: MessageEvent<RecWorkerOutMessage>) => {
              const m = e.data
              if (m.type === 'REC_LINE_DONE') {
                done++
                onLineDone?.(done, total)
              } else if (m.type === 'REC_COMPLETE') {
                worker.removeEventListener('message', handler)
                res(m.results)
              } else if (m.type === 'REC_ERROR') {
                worker.removeEventListener('message', handler)
                rej(new Error(m.error))
              }
            }
            worker.addEventListener('message', handler)
            const transfer = jobs.map((j) => j.croppedImageData.data.buffer)
            worker.postMessage({ type: 'REC_PROCESS', jobs } satisfies RecWorkerInMessage, transfer)
          })

        Promise.all(workers.map((w, i) => dispatch(w, chunks[i])))
          .then((all) => {
            const map = new Map<number, string>()
            for (const r of all.flat()) map.set(r.id, r.raw)
            resolve(map)
          })
          .catch(reject)
      })
    },
    []
  )

  return { isReady, modelState, detectLayout, recognizeLines }
}
