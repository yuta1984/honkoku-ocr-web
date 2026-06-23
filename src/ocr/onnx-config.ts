/**
 * ONNX Runtime Web 設定（Web Worker 内で共有）
 *
 * onnxruntime-web/webgpu（JSEP ビルド）を使用。WASM EP と WebGPU EP の両方を持つ。
 *  - encoder は WebGPU が使える端末では WebGPU EP（fp16, 大幅高速化）。
 *  - decoder / layout は従来どおり WASM EP（int8）。
 * WebGPU は cross-origin isolation 不要なので COOP/COEP 設定は据え置き。
 *
 * Vite の ?url import で JSEP WASM のハッシュ付き URL を取得し、同一オリジン配信する。
 */

import * as ort from 'onnxruntime-web/webgpu'
// webgpu バンドル(ort.webgpu.bundle.min.mjs)は asyncify ランタイムを使う（wasm/WebGPU 共通）
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url'
import mjsUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url'

function initializeONNX() {
  // Vite がバンドルしたハッシュ付き URL を指定（CDN 不要）
  ort.env.wasm.wasmPaths = { wasm: wasmUrl, mjs: mjsUrl }
  // WASM はシングルスレッド（COEP 未設定のため）
  ort.env.wasm.numThreads = 1
  ort.env.logLevel = 'warning'
  ort.env.wasm.proxy = false
}

/** WebGPU アダプタが取得できるか（worker / main いずれでも可）。 */
export async function isWebGpuAvailable(): Promise<boolean> {
  try {
    const gpu = (globalThis.navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } })?.gpu
    if (!gpu) return false
    const adapter = await gpu.requestAdapter()
    return !!adapter
  } catch {
    return false
  }
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
