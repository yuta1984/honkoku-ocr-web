import { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react'
import OpenSeadragon from 'openseadragon'
import type { LineBox, RegionBox, BoundingBox } from '../../types/ocr'
import { rawToKoji } from '../../lib/koji'
import { LAYOUT_CLASS } from '../../types/ocr'

interface ImageViewerProps {
  dataUrl: string
  lines: LineBox[]
  regions: RegionBox[]
  showOverlays: boolean
  selectedOrder: number | null
  onSelectLine: (order: number | null) => void
  onUpdateLine: (order: number, box: BoundingBox) => void
  onDeleteLine: (order: number) => void
  // 領域選択（範囲指定レイアウト/削除）
  regionMode: boolean
  selectedRegion: BoundingBox | null
  onRegionDraw: (region: BoundingBox | null) => void
}

/** 親から命令的に呼べる API（行追加時の可視領域取得などに使う） */
export interface ImageViewerHandle {
  /** 現在ビューに表示中の画像座標系での矩形を返す（未準備なら null） */
  getVisibleImageBounds(): BoundingBox | null
}

const REGION_LABEL: Record<number, string> = {
  [LAYOUT_CLASS.OVERALL]: '全体',
  [LAYOUT_CLASS.ILLUSTRATION]: '図版',
  [LAYOUT_CLASS.STAMP]: '印判',
}

interface HoverState { order: number; text: string; x: number; y: number }
interface ScreenRect { left: number; top: number; width: number; height: number }
type Handle = 'move' | 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se'
const HANDLES: Exclude<Handle, 'move'>[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
const MIN_SIZE = 6

export const ImageViewer = forwardRef<ImageViewerHandle, ImageViewerProps>(function ImageViewer({
  dataUrl, lines, regions, showOverlays, selectedOrder, onSelectLine, onUpdateLine, onDeleteLine,
  regionMode, selectedRegion, onRegionDraw,
}, ref) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<OpenSeadragon.Viewer | null>(null)
  const lineElsRef = useRef<Map<number, HTMLDivElement>>(new Map())
  const [isOpen, setIsOpen] = useState(false)
  const [hover, setHover] = useState<HoverState | null>(null)
  const [selBox, setSelBox] = useState<ScreenRect | null>(null)
  const [drawRect, setDrawRect] = useState<ScreenRect | null>(null)       // ドロー中の矩形（host座標）
  const [regionScreen, setRegionScreen] = useState<ScreenRect | null>(null) // 確定領域の画面矩形

  // 最新 props をハンドラから参照する ref
  const onSelectRef = useRef(onSelectLine)
  const onUpdateRef = useRef(onUpdateLine)
  const onDeleteRef = useRef(onDeleteLine)
  const linesRef = useRef(lines)
  const showRef = useRef(showOverlays)
  const selOrderRef = useRef(selectedOrder)
  const editDraftRef = useRef<BoundingBox | null>(null)
  const recomputeRef = useRef<() => void>(() => {})
  const regionModeRef = useRef(regionMode)
  const regionRef = useRef(selectedRegion)
  const onRegionDrawRef = useRef(onRegionDraw)
  useEffect(() => { onSelectRef.current = onSelectLine }, [onSelectLine])
  useEffect(() => { onUpdateRef.current = onUpdateLine }, [onUpdateLine])
  useEffect(() => { onDeleteRef.current = onDeleteLine }, [onDeleteLine])
  useEffect(() => { linesRef.current = lines }, [lines])
  useEffect(() => { showRef.current = showOverlays }, [showOverlays])
  useEffect(() => { selOrderRef.current = selectedOrder }, [selectedOrder])
  useEffect(() => { onRegionDrawRef.current = onRegionDraw }, [onRegionDraw])

  // 親から呼び出し可能な API。「行を追加」時の可視領域取得に使う。
  useImperativeHandle(ref, () => ({
    getVisibleImageBounds() {
      const viewer = viewerRef.current
      const item = viewer?.world.getItemAt(0)
      if (!viewer || !item) return null
      const r = item.viewportToImageRectangle(viewer.viewport.getBounds())
      return { x: r.x, y: r.y, width: r.width, height: r.height }
    },
  }), [])

  const imgPoint = useCallback((clientX: number, clientY: number) => {
    const viewer = viewerRef.current!
    const r = hostRef.current!.getBoundingClientRect()
    return viewer.viewport.viewerElementToImageCoordinates(new OpenSeadragon.Point(clientX - r.left, clientY - r.top))
  }, [])

  const rectToScreen = useCallback((b: BoundingBox): ScreenRect => {
    const viewer = viewerRef.current!
    const tl = viewer.viewport.imageToViewerElementCoordinates(new OpenSeadragon.Point(b.x, b.y))
    const br = viewer.viewport.imageToViewerElementCoordinates(new OpenSeadragon.Point(b.x + b.width, b.y + b.height))
    return { left: tl.x, top: tl.y, width: br.x - tl.x, height: br.y - tl.y }
  }, [])

  // 選択ボックスの画面矩形を再計算（選択変更・編集中・パン/ズーム時）
  const recomputeSelBox = useCallback(() => {
    const viewer = viewerRef.current
    const order = selOrderRef.current
    if (!viewer || order == null || !showRef.current || !viewer.world.getItemAt(0)) { setSelBox(null); return }
    const line = editDraftRef.current ?? linesRef.current.find((l) => l.readingOrder === order)
    if (!line) { setSelBox(null); return }
    setSelBox(rectToScreen(line))
  }, [rectToScreen])

  // 確定領域の画面矩形を再計算（領域変更・パン/ズーム時）
  const recomputeRegionBox = useCallback(() => {
    const viewer = viewerRef.current
    const rg = regionRef.current
    if (!viewer || !rg || !viewer.world.getItemAt(0)) { setRegionScreen(null); return }
    setRegionScreen(rectToScreen(rg))
  }, [rectToScreen])

  useEffect(() => { recomputeRef.current = () => { recomputeSelBox(); recomputeRegionBox() } }, [recomputeSelBox, recomputeRegionBox])
  // 領域 prop 変化で ref 更新 + 再計算
  useEffect(() => { regionRef.current = selectedRegion; recomputeRegionBox() }, [selectedRegion, isOpen, recomputeRegionBox])
  // 領域モードの ON/OFF で OSD のパン/ズームを抑止しカーソルを変える
  useEffect(() => {
    regionModeRef.current = regionMode
    const viewer = viewerRef.current
    if (viewer) viewer.setMouseNavEnabled(!regionMode)
    if (hostRef.current) hostRef.current.style.cursor = regionMode ? 'crosshair' : ''
    if (!regionMode) setDrawRect(null)
  }, [regionMode])

  // ビューア生成（1回）+ 選択クリック + ホバーポップアップ + viewport追従
  useEffect(() => {
    if (!hostRef.current) return
    const host = hostRef.current
    const viewer = OpenSeadragon({
      element: host,
      showNavigationControl: false,
      gestureSettingsMouse: { clickToZoom: false, dblClickToZoom: true },
      visibilityRatio: 1, minZoomImageRatio: 0.8, maxZoomPixelRatio: 4,
      animationTime: 0.4, preserveImageSizeOnResize: true,
    })
    viewerRef.current = viewer
    viewer.addHandler('update-viewport', () => recomputeRef.current())

    // ホバーで行翻刻ポップアップ（bbox右に縦書き）
    let lastHover = -1
    const onMove = (e: PointerEvent) => {
      if (regionModeRef.current || !showRef.current || !viewer.world.getItemAt(0)) { if (lastHover !== -1) { lastHover = -1; setHover(null) } return }
      const pt = imgPoint(e.clientX, e.clientY)
      const found = linesRef.current.find((l) => pt.x >= l.x && pt.x <= l.x + l.width && pt.y >= l.y && pt.y <= l.y + l.height)
      if (!found || found.raw == null) { if (lastHover !== -1) { lastHover = -1; setHover(null) } return }
      const tr = viewer.viewport.imageToViewerElementCoordinates(new OpenSeadragon.Point(found.x + found.width, found.y))
      lastHover = found.readingOrder
      setHover({ order: found.readingOrder, text: rawToKoji(found.raw) || '（空）', x: tr.x + 8, y: Math.max(4, tr.y) })
    }
    const onLeave = () => { lastHover = -1; setHover(null) }

    // クリック（移動少）で行選択。ドラッグはOSDのパンに任せる。
    let down: { x: number; y: number } | null = null
    const onDown = (e: PointerEvent) => { if (regionModeRef.current) return; down = { x: e.clientX, y: e.clientY } }
    const onUp = (e: PointerEvent) => {
      if (regionModeRef.current || !down) return
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y)
      down = null
      if (moved > 5 || !viewer.world.getItemAt(0)) return
      const pt = imgPoint(e.clientX, e.clientY)
      // 領域が選択されているとき、領域外クリックで領域を解除（行の有無に依らず働く）
      const rg = regionRef.current
      if (rg && !(pt.x >= rg.x && pt.x <= rg.x + rg.width && pt.y >= rg.y && pt.y <= rg.y + rg.height)) {
        onRegionDrawRef.current(null); return
      }
      // 行が表示されていない（未処理）ときは行選択はしない
      if (!showRef.current) return
      const hit = linesRef.current.find((l) => pt.x >= l.x && pt.x <= l.x + l.width && pt.y >= l.y && pt.y <= l.y + l.height)
      onSelectRef.current(hit ? hit.readingOrder : null)
    }

    // 領域ドロー（regionMode 中）: host 上でドラッグして範囲を囲む
    let drawStart: { x: number; y: number } | null = null  // client 座標
    const onRegionDown = (e: PointerEvent) => {
      if (!regionModeRef.current || !viewer.world.getItemAt(0)) return
      drawStart = { x: e.clientX, y: e.clientY }
      host.setPointerCapture?.(e.pointerId)
      setDrawRect({ left: 0, top: 0, width: 0, height: 0 })
    }
    const onRegionMove = (e: PointerEvent) => {
      if (!drawStart) return
      const r = host.getBoundingClientRect()
      const x1 = drawStart.x - r.left, y1 = drawStart.y - r.top
      const x2 = e.clientX - r.left, y2 = e.clientY - r.top
      setDrawRect({ left: Math.min(x1, x2), top: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) })
    }
    const onRegionUp = (e: PointerEvent) => {
      if (!drawStart) return
      const start = drawStart; drawStart = null
      setDrawRect(null)
      const item = viewer.world.getItemAt(0)
      if (!item) { onRegionDrawRef.current(null); return }
      const a = imgPoint(start.x, start.y)
      const b = imgPoint(e.clientX, e.clientY)
      const content = item.getContentSize()
      const x = Math.max(0, Math.min(a.x, b.x))
      const y = Math.max(0, Math.min(a.y, b.y))
      const x2 = Math.min(content.x, Math.max(a.x, b.x))
      const y2 = Math.min(content.y, Math.max(a.y, b.y))
      const w = x2 - x, h = y2 - y
      onRegionDrawRef.current(w >= 4 && h >= 4
        ? { x: Math.round(x), y: Math.round(y), width: Math.round(w), height: Math.round(h) }
        : null)
    }

    host.addEventListener('pointermove', onMove)
    host.addEventListener('pointerleave', onLeave)
    host.addEventListener('pointerdown', onDown)
    host.addEventListener('pointerup', onUp)
    host.addEventListener('pointerdown', onRegionDown)
    host.addEventListener('pointermove', onRegionMove)
    host.addEventListener('pointerup', onRegionUp)

    return () => {
      host.removeEventListener('pointermove', onMove)
      host.removeEventListener('pointerleave', onLeave)
      host.removeEventListener('pointerdown', onDown)
      host.removeEventListener('pointerup', onUp)
      host.removeEventListener('pointerdown', onRegionDown)
      host.removeEventListener('pointermove', onRegionMove)
      host.removeEventListener('pointerup', onRegionUp)
      viewer.destroy()
      viewerRef.current = null
    }
  }, [imgPoint])

  // 画像を開く
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer || !dataUrl) return
    setIsOpen(false); setHover(null); setSelBox(null)
    const onOpen = () => setIsOpen(true)
    viewer.addHandler('open', onOpen)
    viewer.open({ type: 'image', url: dataUrl, buildPyramid: false })
    return () => { viewer.removeHandler('open', onOpen) }
  }, [dataUrl])

  // 視覚オーバーレイ（bbox + 番号 + 領域。pointer-events:none） 再構築
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer || !isOpen) return
    const item = viewer.world.getItemAt(0)
    if (!item) return
    viewer.clearOverlays()
    lineElsRef.current.clear()
    if (!showOverlays) return
    for (const line of lines) {
      const el = document.createElement('div')
      el.className = 'osd-line' + (line.classId === LAYOUT_CLASS.TYPOGRAPHY ? ' osd-line-type' : '')
      const badge = document.createElement('span')
      badge.className = 'osd-order'
      badge.textContent = String(line.readingOrder)
      el.appendChild(badge)
      viewer.addOverlay({ element: el, location: item.imageToViewportRectangle(new OpenSeadragon.Rect(line.x, line.y, line.width, line.height)) })
      lineElsRef.current.set(line.readingOrder, el)
    }
    for (const r of regions) {
      const el = document.createElement('div')
      el.className = 'osd-region'
      const label = REGION_LABEL[r.classId]
      if (label) { const tag = document.createElement('span'); tag.className = 'osd-region-label'; tag.textContent = label; el.appendChild(tag) }
      viewer.addOverlay({ element: el, location: item.imageToViewportRectangle(new OpenSeadragon.Rect(r.x, r.y, r.width, r.height)) })
    }
    lineElsRef.current.forEach((el, ord) => el.classList.toggle('selected', ord === selectedOrder))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, lines, regions, showOverlays])

  // 選択ハイライト + selBox 再計算（自動パンはしない：クリック編集の妨げになるため）
  useEffect(() => {
    lineElsRef.current.forEach((el, ord) => el.classList.toggle('selected', ord === selectedOrder))
    recomputeSelBox()
  }, [selectedOrder, lines, isOpen, showOverlays, recomputeSelBox])

  // 編集（移動/リサイズ）開始
  const startEdit = useCallback((e: React.PointerEvent, handle: Handle) => {
    e.stopPropagation(); e.preventDefault()
    const viewer = viewerRef.current
    const order = selOrderRef.current
    if (!viewer || order == null) return
    const item = viewer.world.getItemAt(0)
    const orig = linesRef.current.find((l) => l.readingOrder === order)
    if (!item || !orig) return
    const content = item.getContentSize() // 画像px
    const imgW = content.x, imgH = content.y
    const start = imgPoint(e.clientX, e.clientY)
    const origBox: BoundingBox = { x: orig.x, y: orig.y, width: orig.width, height: orig.height }
    const target = e.currentTarget as Element
    target.setPointerCapture?.(e.pointerId)

    const onMove = (ev: PointerEvent) => {
      const cur = imgPoint(ev.clientX, ev.clientY)
      const dx = cur.x - start.x, dy = cur.y - start.y
      let { x, y, width, height } = origBox
      if (handle === 'move') { x += dx; y += dy }
      else {
        if (handle.includes('e')) width += dx
        if (handle.includes('s')) height += dy
        if (handle.includes('w')) { x += dx; width -= dx }
        if (handle.includes('n')) { y += dy; height -= dy }
      }
      if (width < MIN_SIZE) { if (handle.includes('w')) x = origBox.x + origBox.width - MIN_SIZE; width = MIN_SIZE }
      if (height < MIN_SIZE) { if (handle.includes('n')) y = origBox.y + origBox.height - MIN_SIZE; height = MIN_SIZE }
      // 画像範囲にクランプ
      x = Math.max(0, Math.min(x, imgW - MIN_SIZE))
      y = Math.max(0, Math.min(y, imgH - MIN_SIZE))
      width = Math.max(MIN_SIZE, Math.min(width, imgW - x))
      height = Math.max(MIN_SIZE, Math.min(height, imgH - y))
      const draft: BoundingBox = { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) }
      editDraftRef.current = draft
      const el = lineElsRef.current.get(order)
      if (el) viewer.updateOverlay(el, item.imageToViewportRectangle(new OpenSeadragon.Rect(draft.x, draft.y, draft.width, draft.height)))
      setSelBox(rectToScreen(draft))
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      const draft = editDraftRef.current
      editDraftRef.current = null
      if (draft) onUpdateRef.current(order, draft)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [imgPoint, rectToScreen])

  return (
    <div className="osd-root">
      <div className="osd-host" ref={hostRef} />

      {/* 確定した選択領域（範囲指定レイアウト/削除の対象） */}
      {regionScreen && !drawRect && (
        <div className="osd-select-region" style={{ left: regionScreen.left, top: regionScreen.top, width: regionScreen.width, height: regionScreen.height }} />
      )}
      {/* ドロー中のライブ矩形 */}
      {drawRect && (
        <div className="osd-select-draw" style={{ left: drawRect.left, top: drawRect.top, width: drawRect.width, height: drawRect.height }} />
      )}

      {/* 選択行の編集レイヤー（移動面 + リサイズハンドル + 削除） */}
      {selBox && (
        <div className="edit-layer" style={{ left: selBox.left, top: selBox.top, width: selBox.width, height: selBox.height }}>
          <div className="edit-move" onPointerDown={(e) => startEdit(e, 'move')} title="ドラッグで移動" />
          {HANDLES.map((h) => (
            <div key={h} className={`edit-h edit-${h}`} onPointerDown={(e) => startEdit(e, h)} />
          ))}
          <button
            className="edit-del"
            title="この行を削除 (Delete)"
            onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); const o = selOrderRef.current; if (o != null) onDeleteRef.current(o) }}
          >×</button>
        </div>
      )}

      {hover && (
        <div className="osd-popup" style={{ left: hover.x, top: hover.y }}>
          <span className="osd-popup-no">{hover.order}</span>
          <span className="osd-popup-text">{hover.text}</span>
        </div>
      )}
    </div>
  )
})
