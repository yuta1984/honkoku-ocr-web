/**
 * モデルファイルのダウンロード・IndexedDBキャッシュ管理
 * 参照実装: ndlkotenocr-worker/src/utils/model-loader.js
 */

const DB_NAME = 'MinnaHonkokuOCRDB'
const DB_VERSION = 2
const STORE_NAME = 'models'

// キャッシュ tag（モデル形式が変わったら更新。OCR の v7/v8 はキャッシュキー側で区別する）
export const MODEL_VERSION = '1.0.0'

// モデル配信ベースURL（環境変数 VITE_MODEL_BASE_URL で指定、末尾スラッシュなし）。
// 指定時は R2 等のバケット直下から、未指定時はローカル public/models/ から配信する。
const MODEL_BASE_URL = (import.meta.env.VITE_MODEL_BASE_URL as string | undefined) ?? ''
// 未指定時は同一オリジンの {base}models/ から（GitHub Pages のサブパス配信に対応するため
// import.meta.env.BASE_URL を前置。worker から fetch しても絶対パスで正しく解決される）。
const modelUrl = (file: string) => (MODEL_BASE_URL ? `${MODEL_BASE_URL}/${file}` : `${import.meta.env.BASE_URL}models/${file}`)

// OCR enc-dec モデルは v7/v8/v11/v12/v13 を切替可能（layout YOLO は共通）。
// 既定は v13(ConvNeXt V2 + 256×2048 高解像度 + KV cache。最高精度 test plain CER 0.0873)。
// v12 = ConvNeXt V1 + 192×1536 + KOJI_NO_RT2 + KV cache(高速。encoder は v13 比 ~1.9× 速い)。
// v11/v8/v7 は設定 UI からは廃止(localStorage に残っていれば DEFAULT へ migrate)。
//   v11 = v8レシピ + クリーンenrich(返点・送り仮名 F1 改善, <rt2> 過剰は decode 後処理で除去)。
// ※ 版ごとに token id→文字 の並びが大きく異なるため、版に対応する vocab を読む必要がある
//   （text-recognizer.ts の vocabUrl 参照）。混用すると全文字が化ける。
// ※ v12/v13 は decoder が prefill+step の2ファイル(KVキャッシュ対応で5–10×高速化)。
//   v7/v8/v11 は decoder 単一(use_cache=false で都度全シーケンス入力)。
// v16fs = v13 と同型(ConvNeXt V2 + 256×2048 + KV cache)だが、語彙を 5000→7710 に拡張し
//   旧字/異体字を忠実保存(旧字→新字変換 OFF)・MLM事前訓練付きで完全ゼロから再学習。
//   test plain CER 0.0801(v13 0.0873 を上回る)。既定。
export type OcrModelVersion = 'v7' | 'v8' | 'v11' | 'v12' | 'v13' | 'v16fs'
export const DEFAULT_OCR_VERSION: OcrModelVersion = 'v16fs'

// レイアウト検出モデルの版。設定で切替可能（localStorage 永続化、useLayoutVersion）。
//   yolo   = koten-layout-best.onnx       (5クラス YOLOv8。手書き/活字=行、図版/印判=領域。本システムオリジナル)
//   rtmdet = rtmdet-s-1280x1280.onnx      (NDL古典籍OCR-Lite 附属の単一クラス行検出器、入力1024×1024、NMS内蔵)
export type LayoutModelVersion = 'rtmdet' | 'yolo'
export const DEFAULT_LAYOUT_VERSION: LayoutModelVersion = 'rtmdet'

const LAYOUT_FILES: Record<LayoutModelVersion, string> = {
  yolo: 'koten-layout-best.onnx',
  rtmdet: 'rtmdet-s-1280x1280.onnx',
}
// v7/v8/v11 は単一 decoder、v12 は KV cache のため prefill + step の2分割。
// 種別ごとにファイル名を別定義し、resolveModel で版に応じて選ぶ。
type SingleDecoderFiles = { encoder: string; decoder: string }
// encoderFp16: WebGPU 用の fp16 encoder（任意。あれば WebGPU 端末で使用）
type SplitDecoderFiles = { encoder: string; encoderFp16?: string; decoderPrefill: string; decoderStep: string }
type OcrModelFiles = SingleDecoderFiles | SplitDecoderFiles
const OCR_MODEL_FILES: Record<OcrModelVersion, OcrModelFiles> = {
  v7:  { encoder: 'kuzushiji-v7-encoder-int8.onnx',  decoder: 'kuzushiji-v7-decoder-int8.onnx' },  // ConvNeXt-Small
  v8:  { encoder: 'kuzushiji-v8-encoder-int8.onnx',  decoder: 'kuzushiji-v8-decoder-int8.onnx' },  // ConvNeXt-Base
  v11: { encoder: 'kuzushiji-v11-encoder-int8.onnx', decoder: 'kuzushiji-v11-decoder-int8.onnx' }, // ConvNeXt-Base + enrich
  // v12: 192×1536 + KOJI_NO_RT2 + KV cache。decoder は prefill(初回CLSでKV構築) + step(1 token/iter) の2本立て。
  v12: {
    encoder: 'kuzushiji-v12-encoder-int8.onnx',
    decoderPrefill: 'kuzushiji-v12-decoder-prefill-int8.onnx',
    decoderStep:    'kuzushiji-v12-decoder-step-int8.onnx',
  },
  // v13: ConvNeXt V2 + 256×2048(enc_seq=512, mw=72)。decoder アーキは v12 と同一(prefill+step KVキャッシュ)。
  v13: {
    encoder: 'kuzushiji-v13-encoder-int8.onnx',
    decoderPrefill: 'kuzushiji-v13-decoder-prefill-int8.onnx',
    decoderStep:    'kuzushiji-v13-decoder-step-int8.onnx',
  },
  // v16fs: v13 と完全同型(256×2048, enc_seq=512, mw=72, RoBERTa 512/6/8)。語彙 7710 へ拡張。
  v16fs: {
    encoder: 'kuzushiji-v16fs-encoder-int8.onnx',
    encoderFp16: 'kuzushiji-v16fs-encoder-fp16.onnx',   // WebGPU 用
    decoderPrefill: 'kuzushiji-v16fs-decoder-prefill-int8.onnx',
    decoderStep:    'kuzushiji-v16fs-decoder-step-int8.onnx',
  },
}
export const HAS_KV_CACHE_DECODER = (version: OcrModelVersion): version is 'v12' | 'v13' | 'v16fs' =>
  version === 'v12' || version === 'v13' || version === 'v16fs'

/** WebGPU 用 fp16 encoder を持つ版か。 */
export const HAS_FP16_ENCODER = (version: OcrModelVersion): boolean => {
  const f = OCR_MODEL_FILES[version]
  return 'encoderFp16' in f && !!f.encoderFp16
}

// modelType + version → 配信URL と キャッシュキー。OCR/レイアウトとも version 別キーで複数キャッシュ可（切替が高速）。
// レイアウトの cacheKey にはファイル名を含める：版内で配信ファイルを差し替えた場合に自動でキャッシュ invalidate するため。
function resolveModel(
  modelType: string,
  version: OcrModelVersion,
  layoutVersion: LayoutModelVersion,
): { url: string; cacheKey: string } {
  if (modelType === 'layout') {
    const file = LAYOUT_FILES[layoutVersion]
    return { url: modelUrl(file), cacheKey: `layout@${layoutVersion}@${file}` }
  }
  const files = OCR_MODEL_FILES[version]
  if (modelType === 'ocrEncoder') return { url: modelUrl(files.encoder), cacheKey: `ocrEncoder@${version}` }
  if (modelType === 'ocrEncoderFp16') {
    if (!('encoderFp16' in files) || !files.encoderFp16) throw new Error(`${version} has no fp16 encoder`)
    return { url: modelUrl(files.encoderFp16), cacheKey: `ocrEncoderFp16@${version}` }
  }
  if (modelType === 'ocrDecoder') {
    if (!('decoder' in files)) throw new Error(`${version} has no single decoder (use ocrDecoderPrefill/Step)`)
    return { url: modelUrl(files.decoder), cacheKey: `ocrDecoder@${version}` }
  }
  if (modelType === 'ocrDecoderPrefill') {
    if (!('decoderPrefill' in files)) throw new Error(`${version} has no prefill decoder`)
    return { url: modelUrl(files.decoderPrefill), cacheKey: `ocrDecoderPrefill@${version}` }
  }
  if (modelType === 'ocrDecoderStep') {
    if (!('decoderStep' in files)) throw new Error(`${version} has no step decoder`)
    return { url: modelUrl(files.decoderStep), cacheKey: `ocrDecoderStep@${version}` }
  }
  throw new Error(`Unknown model type: ${modelType}`)
}

function initDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'name' })
      }
      // 旧スキーマ（履歴キャッシュ）を破棄
      if (db.objectStoreNames.contains('results')) {
        db.deleteObjectStore('results')
      }
    }
  })
}

async function getModelFromCache(
  modelName: string
): Promise<ArrayBuffer | undefined> {
  const db = await initDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.get(modelName)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const entry = request.result
      if (entry && entry.version === MODEL_VERSION) {
        resolve(entry.data)
      } else {
        resolve(undefined)
      }
    }
  })
}

async function saveModelToCache(
  modelName: string,
  data: ArrayBuffer
): Promise<void> {
  const db = await initDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.put({
      name: modelName,
      data,
      cachedAt: Date.now(),
      version: MODEL_VERSION,
    })

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve()
  })
}

async function downloadWithProgress(
  url: string,
  onProgress?: (progress: number) => void
): Promise<ArrayBuffer> {
  // 永続キャッシュは IndexedDB 側で行うため、HTTP キャッシュは使わない（no-store）。
  // これによりキャッシュクリア後の再取得が必ず最新バイトになる（古い版を掴まない）。
  const response = await fetch(url, { cache: 'no-store' })

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`)
  }

  // SPAフォールバックでHTMLが返った場合（モデルファイルが存在しない）を検出
  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('text/html')) {
    throw new Error(`Model file not found (HTML returned): ${url}`)
  }

  const contentLength = parseInt(
    response.headers.get('content-length') || '0',
    10
  )
  let receivedLength = 0

  const reader = response.body!.getReader()
  const chunks: Uint8Array[] = []

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    chunks.push(value)
    receivedLength += value.length

    if (onProgress && contentLength > 0) {
      onProgress(receivedLength / contentLength)
    }
  }

  const allChunks = new Uint8Array(receivedLength)
  let position = 0
  for (const chunk of chunks) {
    allChunks.set(chunk, position)
    position += chunk.length
  }

  return allChunks.buffer
}

export async function loadModel(
  modelType: string,
  onProgress?: (progress: number) => void,
  version: OcrModelVersion = DEFAULT_OCR_VERSION,
  layoutVersion: LayoutModelVersion = DEFAULT_LAYOUT_VERSION,
): Promise<ArrayBuffer> {
  const { url, cacheKey } = resolveModel(modelType, version, layoutVersion)

  const cached = await getModelFromCache(cacheKey)
  if (cached) {
    console.log(`Model ${cacheKey} loaded from cache`)
    if (onProgress) onProgress(1.0)
    return cached
  }

  console.log(`Downloading model ${cacheKey} from ${url}`)
  const modelData = await downloadWithProgress(url, onProgress)

  await saveModelToCache(cacheKey, modelData)
  console.log(`Model ${cacheKey} cached successfully`)

  return modelData
}

export async function clearModelCache(): Promise<void> {
  const db = await initDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.clear()

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve()
  })
}
