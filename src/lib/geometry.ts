import type { BoundingBox } from '../types/ocr'

/** 2 つの矩形が少しでも重なるか（境界接触は非重なり扱い）。座標は画像ピクセル系。 */
export function rectsOverlap(a: BoundingBox, b: BoundingBox): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  )
}

/** 点 (px,py) が矩形 b の内側か。 */
export function pointInRect(px: number, py: number, b: BoundingBox): boolean {
  return px >= b.x && px <= b.x + b.width && py >= b.y && py <= b.y + b.height
}
