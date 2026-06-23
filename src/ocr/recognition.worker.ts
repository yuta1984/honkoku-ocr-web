/**
 * 認識 Worker（CPU 数ぶん並列起動）
 *
 * 各ワーカーが encoder + decoder のセッションを 1 組保持し、割り当てられた行を
 * enc-dec greedy で認識する。モデルデータは OCR Worker が事前に IndexedDB に
 * キャッシュ済みのため、ここでは loadModel がキャッシュから即返す（再DLしない）。
 */

import './onnx-config'
import { isWebGpuAvailable } from './onnx-config'
import { loadModel, HAS_KV_CACHE_DECODER, HAS_FP16_ENCODER } from './model-loader'
import type { OcrModelVersion } from './model-loader'
import { TextRecognizer } from './text-recognizer'
import type { RecWorkerInMessage, RecWorkerOutMessage } from '../types/recognition-worker'

let recognizer: TextRecognizer | null = null

function post(msg: RecWorkerOutMessage, transfer?: Transferable[]) {
  if (transfer) self.postMessage(msg, { transfer })
  else self.postMessage(msg)
}

// encoder/decoder をロードして recognizer を初期化。useGpu 時は fp16 encoder + WebGPU EP。
async function initRecognizer(version: OcrModelVersion, useGpu: boolean): Promise<void> {
  const encType = useGpu ? 'ocrEncoderFp16' : 'ocrEncoder'
  const encoderEP: 'webgpu' | 'wasm' = useGpu ? 'webgpu' : 'wasm'
  recognizer?.dispose()
  recognizer = new TextRecognizer()
  if (HAS_KV_CACHE_DECODER(version)) {
    const [encData, prefillData, stepData] = await Promise.all([
      loadModel(encType,             undefined, version),
      loadModel('ocrDecoderPrefill', undefined, version),
      loadModel('ocrDecoderStep',    undefined, version),
    ])
    await recognizer.initialize({ encoderData: encData, prefillData, stepData, version, encoderEP })
  } else {
    const [encData, decData] = await Promise.all([
      loadModel(encType,      undefined, version),
      loadModel('ocrDecoder', undefined, version),
    ])
    await recognizer.initialize({ encoderData: encData, decoderData: decData, version, encoderEP })
  }
  console.log(`[rec] encoder EP=${encoderEP} (${encType})`)
}

self.onmessage = async (e: MessageEvent<RecWorkerInMessage>) => {
  const msg = e.data

  if (msg.type === 'REC_INIT') {
    try {
      const useGpu = !!msg.useWebGpu && HAS_FP16_ENCODER(msg.version) && await isWebGpuAvailable()
      try {
        await initRecognizer(msg.version, useGpu)
      } catch (gpuErr) {
        if (!useGpu) throw gpuErr
        // WebGPU 初期化失敗 → WASM(int8) にフォールバック
        console.warn('WebGPU encoder init failed; falling back to wasm:', gpuErr)
        await initRecognizer(msg.version, false)
      }
      post({ type: 'REC_READY' })
    } catch (err) {
      post({ type: 'REC_INIT_ERROR', error: (err as Error).message })
    }
  } else if (msg.type === 'REC_PROCESS') {
    try {
      if (!recognizer) throw new Error('Recognizer not initialized')
      const results: Array<{ id: number; raw: string }> = []
      for (const job of msg.jobs) {
        const raw = await recognizer.recognizeCropped(job.croppedImageData)
        results.push({ id: job.id, raw })
        post({ type: 'REC_LINE_DONE', id: job.id, raw }) // 進捗用
      }
      post({ type: 'REC_COMPLETE', results })
    } catch (err) {
      post({ type: 'REC_ERROR', error: (err as Error).message })
    }
  } else if (msg.type === 'REC_TERMINATE') {
    recognizer?.dispose()
    self.close()
  }
}
