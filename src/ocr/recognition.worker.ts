/**
 * 認識 Worker（CPU 数ぶん並列起動）
 *
 * 各ワーカーが encoder + decoder のセッションを 1 組保持し、割り当てられた行を
 * enc-dec greedy で認識する。モデルデータは OCR Worker が事前に IndexedDB に
 * キャッシュ済みのため、ここでは loadModel がキャッシュから即返す（再DLしない）。
 */

import './onnx-config'
import { loadModel, HAS_KV_CACHE_DECODER } from './model-loader'
import { TextRecognizer } from './text-recognizer'
import type { RecWorkerInMessage, RecWorkerOutMessage } from '../types/recognition-worker'

let recognizer: TextRecognizer | null = null

function post(msg: RecWorkerOutMessage, transfer?: Transferable[]) {
  if (transfer) self.postMessage(msg, { transfer })
  else self.postMessage(msg)
}

self.onmessage = async (e: MessageEvent<RecWorkerInMessage>) => {
  const msg = e.data

  if (msg.type === 'REC_INIT') {
    try {
      // v12 は decoder が prefill+step の2ファイル。それ以外は single decoder。
      if (HAS_KV_CACHE_DECODER(msg.version)) {
        const [encData, prefillData, stepData] = await Promise.all([
          loadModel('ocrEncoder',        undefined, msg.version),
          loadModel('ocrDecoderPrefill', undefined, msg.version),
          loadModel('ocrDecoderStep',    undefined, msg.version),
        ])
        recognizer = new TextRecognizer()
        await recognizer.initialize({ encoderData: encData, prefillData, stepData, version: msg.version })
      } else {
        const [encData, decData] = await Promise.all([
          loadModel('ocrEncoder', undefined, msg.version),
          loadModel('ocrDecoder', undefined, msg.version),
        ])
        recognizer = new TextRecognizer()
        await recognizer.initialize({ encoderData: encData, decoderData: decData, version: msg.version })
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
