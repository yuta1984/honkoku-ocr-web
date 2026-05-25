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

// OCR enc-dec モデルは v7/v8 を切替可能（layout YOLO は共通）。
export type OcrModelVersion = 'v7' | 'v8'
export const DEFAULT_OCR_VERSION: OcrModelVersion = 'v8'
const LAYOUT_FILE = 'koten-layout-best.onnx' // 5クラス YOLO(全体/手書き/活字/図版/印判)。手書き/活字=行box
const OCR_MODEL_FILES: Record<OcrModelVersion, { encoder: string; decoder: string }> = {
  v7: { encoder: 'kuzushiji-v7-encoder-int8.onnx', decoder: 'kuzushiji-v7-decoder-int8.onnx' }, // ConvNeXt-Small
  v8: { encoder: 'kuzushiji-v8-encoder-int8.onnx', decoder: 'kuzushiji-v8-decoder-int8.onnx' }, // ConvNeXt-Base(解像度ロバスト)
}

// modelType + version → 配信URL と キャッシュキー。OCR は version 別キーで両方キャッシュ可（切替が高速）。
function resolveModel(modelType: string, version: OcrModelVersion): { url: string; cacheKey: string } {
  if (modelType === 'layout') return { url: modelUrl(LAYOUT_FILE), cacheKey: 'layout' }
  if (modelType === 'ocrEncoder') return { url: modelUrl(OCR_MODEL_FILES[version].encoder), cacheKey: `ocrEncoder@${version}` }
  if (modelType === 'ocrDecoder') return { url: modelUrl(OCR_MODEL_FILES[version].decoder), cacheKey: `ocrDecoder@${version}` }
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
  const response = await fetch(url)

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
  version: OcrModelVersion = DEFAULT_OCR_VERSION
): Promise<ArrayBuffer> {
  const { url, cacheKey } = resolveModel(modelType, version)

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
