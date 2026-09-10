import type { PageInk, Point, Stroke, TextItem } from '../types'

function dist(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function paintStrokeOn(ctx: CanvasRenderingContext2D, s: Stroke) {
  const pts = s.points
  if (!pts.length) return

  if (s.tool === 'rect' && pts.length >= 2) {
    const a = pts[0]
    const b = pts[pts.length - 1]
    ctx.save()
    ctx.strokeStyle = s.color
    ctx.lineWidth = s.width
    ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y)
    ctx.restore()
    return
  }

  if (s.tool === 'ellipse' && pts.length >= 2) {
    const a = pts[0]
    const b = pts[pts.length - 1]
    ctx.save()
    ctx.strokeStyle = s.color
    ctx.lineWidth = s.width
    ctx.beginPath()
    ctx.ellipse(
      (a.x + b.x) / 2,
      (a.y + b.y) / 2,
      Math.abs(b.x - a.x) / 2,
      Math.abs(b.y - a.y) / 2,
      0,
      0,
      Math.PI * 2,
    )
    ctx.stroke()
    ctx.restore()
    return
  }

  if ((s.tool === 'line' || s.tool === 'ruler') && pts.length >= 2) {
    const a = pts[0]
    const b = pts[pts.length - 1]
    ctx.save()
    ctx.strokeStyle = s.color
    ctx.lineWidth = s.width
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
    if (s.tool === 'ruler') {
      const len = dist(a, b)
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      ctx.fillStyle = s.color
      ctx.font = '12px "Source Sans 3", system-ui, sans-serif'
      ctx.fillText(`${Math.round(len)} px`, mid.x + 8, mid.y - 8)
    }
    ctx.restore()
    return
  }

  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = s.width
  if (s.tool === 'eraser') {
    ctx.globalCompositeOperation = 'destination-out'
    ctx.strokeStyle = 'rgba(0,0,0,1)'
  } else {
    ctx.globalCompositeOperation = 'source-over'
    ctx.strokeStyle = s.color
  }
  ctx.beginPath()
  ctx.moveTo(pts[0].x, pts[0].y)
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
  ctx.stroke()
  ctx.restore()
}

export function paintTextsOn(ctx: CanvasRenderingContext2D, texts: TextItem[]) {
  for (const t of texts) {
    ctx.fillStyle = t.color
    ctx.font = `${t.size}px "Source Sans 3", system-ui, sans-serif`
    ctx.fillText(t.text, t.x, t.y)
  }
}

/**
 * Paint ink onto a transparent layer so eraser cannot destroy a locked background.
 * Strokes use CSS pixel coordinates; canvas is sized for device pixels.
 */
export function renderInkLayer(
  cssW: number,
  cssH: number,
  dpr: number,
  pages: PageInk[],
  draft?: Stroke | null,
): HTMLCanvasElement {
  const layer = document.createElement('canvas')
  layer.width = Math.max(1, Math.floor(cssW * dpr))
  layer.height = Math.max(1, Math.floor(cssH * dpr))
  const ctx = layer.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  for (const page of pages) {
    for (const s of page.strokes) {
      if (s.points.length < 2 && s.tool === 'pen') continue
      paintStrokeOn(ctx, s)
    }
    paintTextsOn(ctx, page.texts)
  }
  if (draft && (draft.points.length >= 2 || draft.tool === 'pen')) {
    paintStrokeOn(ctx, draft)
  }
  return layer
}
