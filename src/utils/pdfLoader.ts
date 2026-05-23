/**
 * pdfjs-dist を使用したPDF → ImageData 変換
 */

import type { ProcessedImage } from '../types/ocr'
import { makeThumbnailDataUrl, MAX_IMAGE_DIM } from './imageLoader'
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
    // レンダリング解像度の上限（長辺 MAX_IMAGE_DIM）。大きなページでメモリ枯渇しないよう scale を抑える。
    const base = page.getViewport({ scale: 1 })
    const effScale = Math.min(scale, MAX_IMAGE_DIM / Math.max(base.width, base.height))
    const viewport = page.getViewport({ scale: effScale })

    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    const ctx = canvas.getContext('2d')!

    await page.render({ canvasContext: ctx, viewport }).promise

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const thumbnailDataUrl = makeThumbnailDataUrl(imageData)

    images.push({
      fileName: file.name,
      pageIndex: pageNum,
      imageData,
      thumbnailDataUrl,
    })
  }

  return images
}
