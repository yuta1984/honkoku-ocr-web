/**
 * Google Analytics 4 イベント送信ユーティリティ
 */

declare function gtag(...args: unknown[]): void

export const GA_EVENTS = {
  OCR_START: 'ocr_start',
  OCR_COMPLETE: 'ocr_complete',
  MODEL_DOWNLOAD: 'model_download',
  MODEL_CACHED: 'model_cached',
  CACHE_CLEAR: 'cache_clear',
  LANGUAGE_SWITCH: 'language_switch',
  PDF_PROCESS: 'pdf_process',
} as const

export function trackEvent(
  eventName: string,
  params?: Record<string, string | number>
): void {
  if (typeof gtag !== 'undefined') {
    gtag('event', eventName, params)
  }
}
