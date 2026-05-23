/**
 * 画像ファイル → ImageData + サムネイルDataUrl 変換
 */

import UTIF from 'utif'
import type { ProcessedImage } from '../types/ocr'

const THUMBNAIL_MAX_WIDTH = 200

// 登録画像の長辺上限(px)。10MB級のJPEG等を展開したフル解像度 ImageData を多数保持すると
// メモリが枯渇する（例 5000×7000 ≈ 140MB/枚）。読み込み時にこの上限へ縮小して保持する。
// OCRモデル入力は 1行あたり 128×1024px 固定で、3500px なら密なページでも行幅が128px以上を
// 保てるため（＝モデル入力へは縮小方向）、認識精度は実質落ちない。
export const MAX_IMAGE_DIM = 3500

function fitScale(w: number, h: number): number {
  return Math.min(1, MAX_IMAGE_DIM / Math.max(w, h))
}

/** <img> を上限内に収めて ImageData 化（縮小描画でフル解像度の確保を避ける） */
function imageElementToImageData(img: HTMLImageElement): ImageData {
  const sw = img.naturalWidth || img.width
  const sh = img.naturalHeight || img.height
  const scale = fitScale(sw, sh)
  const w = Math.max(1, Math.round(sw * scale))
  const h = Math.max(1, Math.round(sh * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, w, h)
  return ctx.getImageData(0, 0, w, h)
}

/** 既存 ImageData が上限を超える場合のみ縮小（TIFF 用） */
function maybeDownscaleImageData(src: ImageData): ImageData {
  const scale = fitScale(src.width, src.height)
  if (scale >= 1) return src
  const w = Math.max(1, Math.round(src.width * scale))
  const h = Math.max(1, Math.round(src.height * scale))
  const srcCanvas = document.createElement('canvas')
  srcCanvas.width = src.width
  srcCanvas.height = src.height
  srcCanvas.getContext('2d')!.putImageData(src, 0, 0)
  const dst = document.createElement('canvas')
  dst.width = w
  dst.height = h
  const ctx = dst.getContext('2d')!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(srcCanvas, 0, 0, w, h)
  return ctx.getImageData(0, 0, w, h)
}

export function isTiffFile(file: File): boolean {
  if (file.type === 'image/tiff') return true
  const ext = file.name.toLowerCase().split('.').pop()
  return ext === 'tiff' || ext === 'tif'
}

export function isHeicFile(file: File): boolean {
  if (file.type === 'image/heic' || file.type === 'image/heif') return true
  const ext = file.name.toLowerCase().split('.').pop()
  return ext === 'heic' || ext === 'heif'
}

export async function fileToProcessedImage(file: File): Promise<ProcessedImage> {
  const imageData = await fileToImageData(file)
  const thumbnailDataUrl = makeThumbnailDataUrl(imageData)

  return {
    fileName: file.name,
    imageData,
    thumbnailDataUrl,
  }
}

/** TIFF ファイル（複数ページ対応）→ ProcessedImage[] */
export async function tiffToProcessedImages(file: File): Promise<ProcessedImage[]> {
  const buffer = await file.arrayBuffer()
  const ifds = UTIF.decode(buffer)
  const results: ProcessedImage[] = []

  for (let i = 0; i < ifds.length; i++) {
    UTIF.decodeImage(buffer, ifds[i])
    const w = ifds[i].width
    const h = ifds[i].height
    const rgba = UTIF.toRGBA8(ifds[i])
    const imageData = maybeDownscaleImageData(new ImageData(new Uint8ClampedArray(rgba), w, h))
    const thumbnailDataUrl = makeThumbnailDataUrl(imageData)
    results.push({
      fileName: file.name,
      pageIndex: ifds.length > 1 ? i + 1 : undefined,
      imageData,
      thumbnailDataUrl,
    })
  }

  return results
}

async function fileToImageData(file: File): Promise<ImageData> {
  if (isHeicFile(file)) return heicFileToImageData(file)
  return standardImageToImageData(file)
}

async function heicFileToImageData(file: File): Promise<ImageData> {
  // heic2any は重いため動的インポート（初回HEIC処理時のみ読み込み）
  const { default: heic2any } = await import('heic2any')
  const result = await heic2any({ blob: file, toType: 'image/png' })
  const pngBlob = Array.isArray(result) ? result[0] : result
  return blobToImageData(pngBlob, file.name)
}

async function blobToImageData(blob: Blob, name: string): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(blob)
    img.onload = () => {
      const data = imageElementToImageData(img)
      URL.revokeObjectURL(url)
      resolve(data)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error(`Failed to load image: ${name}`))
    }
    img.src = url
  })
}

async function standardImageToImageData(file: File): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      const data = imageElementToImageData(img)
      URL.revokeObjectURL(url)
      resolve(data)
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error(`Failed to load image: ${file.name}`))
    }

    img.src = url
  })
}

export function makeThumbnailDataUrl(imageData: ImageData): string {
  const scale = Math.min(1, THUMBNAIL_MAX_WIDTH / imageData.width)
  const w = Math.round(imageData.width * scale)
  const h = Math.round(imageData.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!

  // ImageData → 元サイズキャンバス → 縮小キャンバス
  const srcCanvas = document.createElement('canvas')
  srcCanvas.width = imageData.width
  srcCanvas.height = imageData.height
  srcCanvas.getContext('2d')!.putImageData(imageData, 0, 0)
  ctx.drawImage(srcCanvas, 0, 0, w, h)

  return canvas.toDataURL('image/jpeg', 0.7)
}

export function imageDataToDataUrl(imageData: ImageData, quality = 0.85): string {
  const canvas = document.createElement('canvas')
  canvas.width = imageData.width
  canvas.height = imageData.height
  canvas.getContext('2d')!.putImageData(imageData, 0, 0)
  return canvas.toDataURL('image/jpeg', quality)
}

/** フル画像から行領域を一括 crop（source canvas を1度だけ生成して使い回す） */
export function cropLines(
  imageData: ImageData,
  boxes: Array<{ x: number; y: number; width: number; height: number }>
): ImageData[] {
  const src = document.createElement('canvas')
  src.width = imageData.width
  src.height = imageData.height
  src.getContext('2d')!.putImageData(imageData, 0, 0)

  return boxes.map((b) => {
    const w = Math.max(1, Math.round(b.width))
    const h = Math.max(1, Math.round(b.height))
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const ctx = c.getContext('2d')!
    ctx.drawImage(src, b.x, b.y, b.width, b.height, 0, 0, w, h)
    return ctx.getImageData(0, 0, w, h)
  })
}
