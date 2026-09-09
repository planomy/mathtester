import { jsPDF } from 'jspdf'
import type { PageInk, Point } from '../types'

const PAGE_W = 1200
const PAGE_H = 1600

function drawStroke(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  color: string,
  width: number,
  eraser: boolean,
) {
  if (points.length < 2) return
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = width
  if (eraser) {
    ctx.globalCompositeOperation = 'destination-out'
    ctx.strokeStyle = 'rgba(0,0,0,1)'
  } else {
    ctx.globalCompositeOperation = 'source-over'
    ctx.strokeStyle = color
  }
  ctx.beginPath()
  ctx.moveTo(points[0].x, points[0].y)
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y)
  }
  ctx.stroke()
  ctx.restore()
}

export function renderPageToCanvas(
  page: PageInk,
  prompt: string,
  meta: { studentName: string; testTitle: string; index: number; total: number },
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = PAGE_W
  canvas.height = PAGE_H
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#faf8f4'
  ctx.fillRect(0, 0, PAGE_W, PAGE_H)

  // Header
  ctx.fillStyle = '#0f766e'
  ctx.fillRect(0, 0, PAGE_W, 120)
  ctx.fillStyle = '#ecfdf5'
  ctx.font = '600 28px system-ui, sans-serif'
  ctx.fillText(meta.testTitle, 40, 48)
  ctx.font = '400 20px system-ui, sans-serif'
  ctx.fillText(
    `${meta.studentName}  ·  Q${meta.index + 1} of ${meta.total}`,
    40,
    88,
  )

  // Prompt
  ctx.fillStyle = '#134e4a'
  ctx.font = '700 48px system-ui, sans-serif'
  wrapText(ctx, prompt, 40, 180, PAGE_W - 80, 58)

  // Working area border
  ctx.strokeStyle = '#cbd5e1'
  ctx.lineWidth = 2
  ctx.strokeRect(30, 280, PAGE_W - 60, PAGE_H - 320)

  // Light grid
  ctx.save()
  ctx.beginPath()
  ctx.rect(30, 280, PAGE_W - 60, PAGE_H - 320)
  ctx.clip()
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)'
  ctx.lineWidth = 1
  for (let y = 280; y < PAGE_H - 40; y += 40) {
    ctx.beginPath()
    ctx.moveTo(30, y)
    ctx.lineTo(PAGE_W - 30, y)
    ctx.stroke()
  }

  const offsetY = 280
  for (const stroke of page.strokes) {
    const pts = stroke.points.map((p) => ({ x: p.x, y: p.y + offsetY }))
    if (stroke.tool === 'line' || stroke.tool === 'ruler') {
      if (pts.length >= 2) {
        drawStroke(ctx, [pts[0], pts[pts.length - 1]], stroke.color, stroke.width, false)
      }
    } else if (stroke.tool === 'rect' && pts.length >= 2) {
      const a = pts[0]
      const b = pts[pts.length - 1]
      ctx.save()
      ctx.strokeStyle = stroke.color
      ctx.lineWidth = stroke.width
      ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y)
      ctx.restore()
    } else if (stroke.tool === 'ellipse' && pts.length >= 2) {
      const a = pts[0]
      const b = pts[pts.length - 1]
      ctx.save()
      ctx.strokeStyle = stroke.color
      ctx.lineWidth = stroke.width
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
    } else {
      drawStroke(ctx, pts, stroke.color, stroke.width, stroke.tool === 'eraser')
    }
  }

  for (const t of page.texts) {
    ctx.fillStyle = t.color
    ctx.font = `${t.size}px system-ui, sans-serif`
    ctx.fillText(t.text, t.x, t.y + offsetY)
  }
  ctx.restore()

  return canvas
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
) {
  const words = text.split(/\s+/)
  let line = ''
  let yy = y
  for (const word of words) {
    const test = line ? `${line} ${word}` : word
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, yy)
      line = word
      yy += lineHeight
    } else {
      line = test
    }
  }
  if (line) ctx.fillText(line, x, yy)
}

export async function buildTestPdf(opts: {
  testTitle: string
  studentName: string
  prompts: string[]
  pages: PageInk[]
}): Promise<Blob> {
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4',
  })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()

  for (let i = 0; i < opts.pages.length; i++) {
    if (i > 0) pdf.addPage()
    const canvas = renderPageToCanvas(opts.pages[i], opts.prompts[i] || '', {
      studentName: opts.studentName,
      testTitle: opts.testTitle,
      index: i,
      total: opts.pages.length,
    })
    const img = canvas.toDataURL('image/jpeg', 0.82)
    pdf.addImage(img, 'JPEG', 0, 0, pageWidth, pageHeight)
  }

  return pdf.output('blob')
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
