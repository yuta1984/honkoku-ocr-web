/**
 * pdfjs-dist を使用したPDF → ImageData 変換
 */

import type { ProcessedImage } from '../types/ocr'
import { packImageData, MAX_IMAGE_DIM, MIN_IMAGE_DIM } from './imageLoader'
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

let pdfjsLib: typeof import('pdfjs-dist') | null = null

async function getPdfJs() {
  if (!pdfjsLib) {
    pdfjsLib = await import('pdfjs-dist')
    // Viteがバンドルしたハッシュ付きURLを使用（CDN不要・COEP対応）
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc
  }
  return pdfjsLib
}

export async function pdfToProcessedImages(
  file: File,
  scale = 2.0,
  onProgress?: (current: number, total: number) => void
): Promise<ProcessedImage[]> {
  const pdfjs = await getPdfJs()
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise
  const totalPages = pdf.numPages

  const images: ProcessedImage[] = []

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    if (onProgress) onProgress(pageNum, totalPages)

    const page = await pdf.getPage(pageNum)
    // レンダリング解像度を長辺 [MIN_IMAGE_DIM, MAX_IMAGE_DIM] に収める。
    //   上限: 大きなページでメモリ枯渇しないよう scale を抑える。
    //   下限: 小さく描くと行幅が学習時(中央値187px)から大きく外れ、行検出が断片化して
    //         隣接行が同じテキストを出す。★PDF はベクタから描き直せるので、画素を
    //         引き伸ばす imageLoader 側の拡大と違い、ここでの底上げは実際に精細になる。
    const base = page.getViewport({ scale: 1 })
    const long = Math.max(base.width, base.height)
    const effScale = Math.min(
      Math.max(scale, MIN_IMAGE_DIM / long),
      MAX_IMAGE_DIM / long,
    )
    const viewport = page.getViewport({ scale: effScale })

    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    const ctx = canvas.getContext('2d')!

    await page.render({ canvasContext: ctx, viewport }).promise

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    images.push(await packImageData(imageData, file.name, pageNum))
  }

  return images
}
