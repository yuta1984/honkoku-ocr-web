/**
 * IIIF Presentation マニフェスト(v2 / v3)を読み込み、各カンバスの画像を
 * File 化して取り込むためのユーティリティ。
 *
 * - マニフェスト JSON は CORS 付きで配信されている前提(IIIF ビューア用途で通常許可)。
 * - 画像は IIIF Image API サービスがあれば長辺を上限サイズに抑えて取得し、
 *   無ければカンバスの画像 URL を直接取得する。
 */

export interface IiifCanvasImage {
  /** 取得に使う URL(Image API サービスがあればサイズ指定済み) */
  url: string
  /** Image API が使えない場合のフォールバック(リソースの直 URL) */
  fallbackUrl: string
  /** ファイル名・一覧表示用ラベル */
  label: string
}

export interface IiifManifest {
  label: string
  images: IiifCanvasImage[]
}

/** 取り込み画像の長辺上限(px)。OCR には十分・巨大原本のメモリ過多を防ぐ。 */
export const IIIF_MAX_EDGE = 2000

// ---- ラベル正規化(v2: string|配列, v3: 言語マップ) ----
function normLabel(label: unknown): string {
  if (!label) return ''
  if (typeof label === 'string') return label
  if (Array.isArray(label)) {
    const first = label[0]
    if (typeof first === 'string') return first
    if (first && typeof first === 'object' && '@value' in first) return String((first as { '@value': unknown })['@value'] ?? '')
    return ''
  }
  if (typeof label === 'object') {
    // v3 言語マップ {"ja":["..."], "none":["..."]}
    const map = label as Record<string, unknown>
    const vals = map.ja ?? map.en ?? map.none ?? Object.values(map)[0]
    if (Array.isArray(vals)) return String(vals[0] ?? '')
    if (typeof vals === 'string') return vals
    // v2 {"@value": "..."}
    if ('@value' in map) return String(map['@value'] ?? '')
  }
  return ''
}

// ---- IIIF Image API サービス ID 抽出 ----
function serviceId(service: unknown): string | null {
  if (!service) return null
  const s = Array.isArray(service) ? service[0] : service
  if (!s || typeof s !== 'object') return null
  const obj = s as Record<string, unknown>
  const id = obj['@id'] ?? obj['id']
  return typeof id === 'string' ? id : null
}

/** Image API URL を長辺上限付きで組み立てる(v2/v3 共通の !w,h = 縮小のみのベストフィット)。 */
function imageApiUrl(svcId: string, maxEdge = IIIF_MAX_EDGE): string {
  const base = svcId.replace(/\/$/, '')
  return `${base}/full/!${maxEdge},${maxEdge}/0/default.jpg`
}

// ---- v3: Canvas -> 画像 ----
function imageFromV3Canvas(canvas: Record<string, unknown>, idx: number): IiifCanvasImage | null {
  const items = canvas.items as unknown[] | undefined
  const annoPage = items?.[0] as Record<string, unknown> | undefined
  const annos = annoPage?.items as unknown[] | undefined
  const anno = annos?.[0] as Record<string, unknown> | undefined
  if (!anno) return null
  const bodyRaw = anno.body
  const body = (Array.isArray(bodyRaw) ? bodyRaw[0] : bodyRaw) as Record<string, unknown> | undefined
  if (!body) return null
  const direct = typeof body.id === 'string' ? body.id : ''
  const svc = serviceId(body.service)
  if (!direct && !svc) return null
  return {
    url: svc ? imageApiUrl(svc) : direct,
    fallbackUrl: direct || (svc ? `${svc.replace(/\/$/, '')}/full/full/0/default.jpg` : ''),
    label: normLabel(canvas.label) || `p${idx + 1}`,
  }
}

// ---- v2: Canvas -> 画像 ----
function imageFromV2Canvas(canvas: Record<string, unknown>, idx: number): IiifCanvasImage | null {
  const images = canvas.images as unknown[] | undefined
  const img = images?.[0] as Record<string, unknown> | undefined
  const resource = img?.resource as Record<string, unknown> | undefined
  if (!resource) return null
  const direct = typeof resource['@id'] === 'string' ? (resource['@id'] as string) : ''
  const svc = serviceId(resource.service)
  if (!direct && !svc) return null
  return {
    url: svc ? imageApiUrl(svc) : direct,
    fallbackUrl: direct || (svc ? `${svc.replace(/\/$/, '')}/full/full/0/default.jpg` : ''),
    label: normLabel(canvas.label) || `p${idx + 1}`,
  }
}

/** マニフェスト URL を読み込み、ラベルとカンバス画像の一覧を返す。 */
export async function fetchManifest(url: string, signal?: AbortSignal): Promise<IiifManifest> {
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`マニフェスト取得失敗 (HTTP ${res.status})`)
  const data = (await res.json()) as Record<string, unknown>

  const label = normLabel(data.label) || 'IIIF'
  const images: IiifCanvasImage[] = []

  // v3: items[] が Canvas
  if (Array.isArray(data.items)) {
    ;(data.items as unknown[]).forEach((c, i) => {
      const img = imageFromV3Canvas(c as Record<string, unknown>, i)
      if (img) images.push(img)
    })
  }
  // v2: sequences[].canvases[]
  if (images.length === 0 && Array.isArray(data.sequences)) {
    const seq = (data.sequences as unknown[])[0] as Record<string, unknown> | undefined
    const canvases = seq?.canvases as unknown[] | undefined
    canvases?.forEach((c, i) => {
      const img = imageFromV2Canvas(c as Record<string, unknown>, i)
      if (img) images.push(img)
    })
  }

  if (images.length === 0) {
    throw new Error('マニフェストから画像を取得できませんでした(対応外の形式の可能性)')
  }
  return { label, images }
}

function safeName(label: string, idx: number): string {
  const cleaned = label.replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 60) || `iiif_${idx + 1}`
  return `${String(idx + 1).padStart(3, '0')}_${cleaned}.jpg`
}

/** カンバス画像を取得して File 化。サイズ指定 URL が失敗したらフォールバックを試す。 */
export async function fetchCanvasImage(img: IiifCanvasImage, idx: number, signal?: AbortSignal): Promise<File> {
  const tryFetch = async (u: string) => {
    const r = await fetch(u, { signal })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return r.blob()
  }
  let blob: Blob
  try {
    blob = await tryFetch(img.url)
  } catch (e) {
    if (signal?.aborted) throw e
    if (img.fallbackUrl && img.fallbackUrl !== img.url) {
      blob = await tryFetch(img.fallbackUrl)
    } else {
      throw e
    }
  }
  return new File([blob], safeName(img.label, idx), { type: blob.type || 'image/jpeg' })
}
