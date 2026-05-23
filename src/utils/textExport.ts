/**
 * 認識テキストのダウンロード（txt / xml / Word(docx)）
 * xml/docx は koji-lang で Koji 記法を解析して変換する。
 * 複数ページは各ページ冒頭に【ファイル名】を挿入してから結合する。
 */

import * as Koji from 'koji-lang'
import type { PageItem } from '../types/ocr'
import { rawToKoji } from './koji'

export type ExportFormat = 'txt' | 'xml' | 'docx'

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

function pageLabel(page: PageItem): string {
  return page.pageIndex ? `${page.fileName} (p.${page.pageIndex})` : page.fileName
}

/** ページの行を読み順に Koji 記法へ */
function pageToKoji(page: PageItem): string {
  return [...page.lines]
    .sort((a, b) => a.readingOrder - b.readingOrder)
    .filter((l) => l.raw != null)
    .map((l) => rawToKoji(l.raw ?? ''))
    .join('\n')
}

/** 複数ページを Koji ソースに結合（withHeader 時は各ページ冒頭に【ファイル名】） */
function buildSource(pages: PageItem[], withHeader: boolean): string {
  return pages
    .map((p) => (withHeader ? `【${pageLabel(p)}】\n${pageToKoji(p)}` : pageToKoji(p)))
    .join('\n\n')
}

function sanitize(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, '_').replace(/\.[^.]+$/, '')
}

function triggerDownload(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function base64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return new Blob([arr], { type: mime })
}

/** pages を指定フォーマットでダウンロード。baseName は拡張子なしのファイル名。 */
export async function downloadPages(
  pages: PageItem[],
  format: ExportFormat,
  baseName: string,
  withHeader: boolean
): Promise<void> {
  const name = sanitize(baseName) || 'transcription'
  const source = buildSource(pages, withHeader)

  if (format === 'txt') {
    triggerDownload(`${name}.txt`, new Blob([source], { type: 'text/plain;charset=utf-8' }))
    return
  }

  const { ast } = Koji.parse(source)
  if (format === 'xml') {
    triggerDownload(`${name}.xml`, new Blob([Koji.convertToXML(ast)], { type: 'application/xml;charset=utf-8' }))
  } else {
    const b64 = await Koji.convertToDocx(ast, 'base64')
    triggerDownload(`${name}.docx`, base64ToBlob(b64, DOCX_MIME))
  }
}

/** 単一ページ用の baseName（ファイル名＋ページ番号） */
export function pageBaseName(page: PageItem): string {
  const base = page.fileName.replace(/\.[^.]+$/, '')
  return page.pageIndex ? `${base}_p${page.pageIndex}` : base
}
