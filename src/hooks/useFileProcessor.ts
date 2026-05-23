import { useState, useCallback } from 'react'
import type { ProcessedImage } from '../types/ocr'
import { fileToProcessedImage, tiffToProcessedImages, isTiffFile, isHeicFile } from '../lib/imageLoader'
import { pdfToProcessedImages } from '../lib/pdfLoader'

export interface FileLoadingState {
  fileName: string
  currentPage: number | null
  totalPages: number | null
}

export function useFileProcessor() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fileLoadingState, setFileLoadingState] = useState<FileLoadingState | null>(null)

  /** ファイル群を ProcessedImage[] に展開して返す（state は置き換えず呼び出し側で追加する） */
  const loadFiles = useCallback(async (files: File[]): Promise<ProcessedImage[]> => {
    setIsLoading(true)
    setError(null)
    const images: ProcessedImage[] = []
    try {
      for (const file of files) {
        if (file.type === 'application/pdf') {
          setFileLoadingState({ fileName: file.name, currentPage: null, totalPages: null })
          const pages = await pdfToProcessedImages(file, 2.0, (current, total) => {
            setFileLoadingState({ fileName: file.name, currentPage: current, totalPages: total })
          })
          images.push(...pages)
        } else if (isTiffFile(file)) {
          setFileLoadingState({ fileName: file.name, currentPage: null, totalPages: null })
          images.push(...(await tiffToProcessedImages(file)))
        } else if (file.type.startsWith('image/') || isHeicFile(file)) {
          setFileLoadingState({ fileName: file.name, currentPage: null, totalPages: null })
          images.push(await fileToProcessedImage(file))
        }
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsLoading(false)
      setFileLoadingState(null)
    }
    return images
  }, [])

  return { isLoading, error, fileLoadingState, loadFiles }
}
