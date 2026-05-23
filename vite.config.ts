import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  // GitHub Pages（project site）はサブパス配信のため build 時のみ base を付ける。
  // dev は '/' のまま。import.meta.env.BASE_URL で worker からのモデル/語彙取得 URL を組む。
  base: command === 'build' ? '/honkoku-ocr-web/' : '/',

  plugins: [react()],

  // ONNX Runtime Web: Viteのesbuildプリバンドルを除外（WASMバイナリが壊れるのを防ぐ）
  optimizeDeps: {
    exclude: ['onnxruntime-web', 'onnxruntime-web/wasm'],
  },

  // WASMとONNXファイルをアセットとして認識
  assetsInclude: ['**/*.wasm', '**/*.onnx'],

  build: {
    target: 'esnext',
  },

  // Web WorkerをES moduleフォーマットで出力
  worker: {
    format: 'es',
  },
}))

// 注: onnxruntime-web は単一スレッド(numThreads=1)で動かすため、SharedArrayBuffer
// （= COOP/COEP によるクロスオリジン分離）は不要。COEP require-corp を付けると
// 外部 R2 等のクロスオリジン・モデル取得がブロックされるため付与しない。
