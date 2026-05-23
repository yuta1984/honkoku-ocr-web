/**
 * ONNX Runtime Web 設定
 * Web Worker内での統一設定
 *
 * onnxruntime-web/wasm を使用（JSEP/WebGPU不要、CPU専用）
 * Viteの?url importでWASMのハッシュ付きURLを取得し、
 * CDN不要・COEP対応の同一オリジン配信を実現する
 */

import * as ort from 'onnxruntime-web/wasm'
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url'

function initializeONNX() {
  // Viteがバンドルしたハッシュ付きURLを指定（CDN不要・COEP対応）
  ort.env.wasm.wasmPaths = { wasm: wasmUrl }

  // シングルスレッドで安定動作
  ort.env.wasm.numThreads = 1
  ort.env.logLevel = 'warning'

  // Web Worker内ではプロキシワーカー不要
  ort.env.wasm.proxy = false
}

export async function createSession(
  modelData: ArrayBuffer,
  options: Partial<ort.InferenceSession.SessionOptions> = {}
): Promise<ort.InferenceSession> {
  const defaultOptions: ort.InferenceSession.SessionOptions = {
    executionProviders: ['wasm'],
    logSeverityLevel: 4,
    graphOptimizationLevel: 'basic',
    enableCpuMemArena: false,
    enableMemPattern: false,
    ...options,
  }

  try {
    const session = await ort.InferenceSession.create(modelData, defaultOptions)
    return session
  } catch (error) {
    console.error('Failed to create ONNX session:', error)
    throw error
  }
}

initializeONNX()

export { ort }
