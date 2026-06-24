/**
 * ONNX Runtime Web 設定（Web Worker 内で共有）
 *
 * ランタイムビルドを用途で出し分ける（メモリ削減）:
 *  - WebGPU を使うワーカー → onnxruntime-web/webgpu（JSEP/asyncify ランタイム・重い ~27MB）
 *  - それ以外（iOS・WebGPU 非対応・レイアウト専用ワーカー）→ onnxruntime-web/wasm（軽い ~12MB）
 *
 * asyncify ランタイムは wasm 本体も実行時メモリも大きく、iOS Safari の厳しいタブ毎
 * メモリ上限でクラッシュの原因になる。WebGPU を使わない経路では必ず軽い wasm-only を使う。
 *
 * ビルド選択は実行時（initOrt）に行う。iOS 判定はワーカーでは不確実(maxTouchPoints 不可)
 * なため、main から渡る useWebGpu フラグ（iOS 考慮済み）を信頼する。
 */

import type * as OrtNS from 'onnxruntime-web'
// Vite に両ランタイムの wasm/mjs を emit させる（実際に fetch されるのは選んだ方のみ）
import asyncifyWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url'
import asyncifyMjsUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url'
import simdWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url'

// 初期化後にセットされる live binding。importer は initOrt 完了後に ort.* を使うこと。
export let ort: typeof OrtNS

let initP: Promise<void> | null = null

/** ランタイムを一度だけ読み込む。useWebGpu=true なら webgpu(asyncify) ビルド、false なら軽量 wasm-only。 */
export function initOrt(useWebGpu: boolean): Promise<void> {
  if (!initP) {
    initP = (async () => {
      const mod = useWebGpu
        ? await import('onnxruntime-web/webgpu')
        : await import('onnxruntime-web/wasm')
      ort = mod as unknown as typeof OrtNS
      ort.env.wasm.wasmPaths = useWebGpu
        ? { wasm: asyncifyWasmUrl, mjs: asyncifyMjsUrl }
        : { wasm: simdWasmUrl }
      ort.env.wasm.numThreads = 1   // WASM はシングルスレッド（COEP 未設定のため）
      ort.env.logLevel = 'warning'
      ort.env.wasm.proxy = false
    })()
  }
  return initP
}

/** WebGPU アダプタが取得できるか（worker / main いずれでも可）。ort のロード不要。 */
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
  options: Partial<OrtNS.InferenceSession.SessionOptions> = {}
): Promise<OrtNS.InferenceSession> {
  if (!ort) throw new Error('ort not initialized: call initOrt() before createSession()')
  const defaultOptions: OrtNS.InferenceSession.SessionOptions = {
    executionProviders: ['wasm'],
    logSeverityLevel: 4,
    graphOptimizationLevel: 'basic',
    enableCpuMemArena: false,
    enableMemPattern: false,
    ...options,
  }
  try {
    return await ort.InferenceSession.create(modelData, defaultOptions)
  } catch (error) {
    console.error('Failed to create ONNX session:', error)
    throw error
  }
}
