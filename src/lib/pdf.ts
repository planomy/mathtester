import { jsPDF } from 'jspdf'
import { renderInkLayer } from './inkLayer'
import { drawLockedSource, loadLockedImage } from './lockedSource'
import type { LockedSource, PageInk, Point, Stroke, TextItem } from '../types'

const PAGE_W = 1200
const HEADER_H = 120
const PROMPT_TOP = 180
const WORK_TOP = 280
const MIN_WORK_H = 420
const MAX_WORK_H = 720
const CONTENT_PAD = 48
const FOOTER_PAD = 36

export const WORK_OFFSET_Y = WORK_TOP

function inkExtentY(page: PageInk): number {
  let maxY = 0
  for (const stroke of page.strokes) {
    const pad = stroke.width
    for (const p of stroke.points) {
      maxY = Math.max(maxY, p.y + pad)
    }
  }
  for (const t of page.texts) {
    maxY = Math.max(maxY, t.y + t.size)
  }
  return maxY
}

function workHeightFor(page: PageInk, marks?: PageInk, hasSource?: boolean): number {
  const contentY = Math.max(inkExtentY(page), marks ? inkExtentY(marks) : 0)
  if (hasSource && contentY <= 0) return MAX_WORK_H
  if (contentY <= 0) return MIN_WORK_H
  const base = Math.min(MAX_WORK_H, Math.max(MIN_WORK_H, Math.ceil(contentY + CONTENT_PAD)))
  return hasSource ? Math.max(base, Math.min(MAX_WORK_H, 560)) : base
}

function promptBlockHeight(prompt: string): number {
  const avgChar = 26
  const charsPerLine = Math.max(12, Math.floor((PAGE_W - 80) / avgChar))
  const lines = Math.max(1, Math.ceil((prompt || ' ').length / charsPerLine))
  return Math.min(160, lines * 58)
}

export async function renderPageToCanvas(
  page: PageInk,
  prompt: string,
  meta: {
    studentName: string
    testTitle: string
    index: number
    total: number
    marks?: PageInk
    marked?: boolean
    lockedSource?: LockedSource | null
  },
): Promise<HTMLCanvasElement> {
  const promptH = promptBlockHeight(prompt)
  const workTop = Math.max(WORK_TOP, PROMPT_TOP + promptH + 24)
  const workH = workHeightFor(page, meta.marks, Boolean(meta.lockedSource))
  const pageH = workTop + workH + FOOTER_PAD
  const workW = PAGE_W - 60

  const canvas = document.createElement('canvas')
  canvas.width = PAGE_W
  canvas.height = pageH
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#faf8f4'
  ctx.fillRect(0, 0, PAGE_W, pageH)

  ctx.fillStyle = '#0f766e'
  ctx.fillRect(0, 0, PAGE_W, HEADER_H)
  ctx.fillStyle = '#ecfdf5'
  ctx.font = '700 30px system-ui, sans-serif'
  ctx.fillText(meta.studentName, 40, 48)
  ctx.font = '400 20px system-ui, sans-serif'
  ctx.fillText(
    `${meta.testTitle}  ·  Q${meta.index + 1} of ${meta.total}`,
    40,
    88,
  )

  if (meta.marked) {
    ctx.fillStyle = '#b91c1c'
    ctx.font = '700 22px system-ui, sans-serif'
    ctx.fillText('MARKED', PAGE_W - 160, 70)
  }

  ctx.fillStyle = '#134e4a'
  ctx.font = '700 48px system-ui, sans-serif'
  wrapText(ctx, prompt, 40, PROMPT_TOP, PAGE_W - 80, 58)

  ctx.strokeStyle = '#cbd5e1'
  ctx.lineWidth = 2
  ctx.strokeRect(30, workTop, workW, workH)

  ctx.save()
  ctx.beginPath()
  ctx.rect(30, workTop, workW, workH)
  ctx.clip()

  if (meta.lockedSource?.dataUrl) {
    try {
      const img = await loadLockedImage(meta.lockedSource.dataUrl)
      drawLockedSource(ctx, img, 30, workTop, workW, workH)
    } catch {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(30, workTop, workW, workH)
    }
  } else {
    ctx.fillStyle = '#f7f4ee'
    ctx.fillRect(30, workTop, workW, workH)
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)'
    ctx.lineWidth = 1
    for (let y = workTop; y < workTop + workH; y += 40) {
      ctx.beginPath()
      ctx.moveTo(30, y)
      ctx.lineTo(PAGE_W - 30, y)
      ctx.stroke()
    }
  }

  const pages = [page, ...(meta.marks ? [meta.marks] : [])]
  const ink = renderInkLayer(workW, workH, 1, pages)
  ctx.drawImage(ink, 30, workTop)
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
  markPages?: PageInk[]
  marked?: boolean
  sources?: (LockedSource | null | undefined)[]
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
    const canvas = await renderPageToCanvas(opts.pages[i], opts.prompts[i] || '', {
      studentName: opts.studentName,
      testTitle: opts.testTitle,
      index: i,
      total: opts.pages.length,
      marks: opts.markPages?.[i],
      marked: opts.marked,
      lockedSource: opts.sources?.[i],
    })
    const img = canvas.toDataURL('image/jpeg', 0.85)
    const imgH = pageWidth * (canvas.height / canvas.width)
    const drawH = Math.min(imgH, pageHeight)
    pdf.addImage(img, 'JPEG', 0, 0, pageWidth, drawH)
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

export function emptyInk(): PageInk {
  return { strokes: [], texts: [] }
}

export type { Stroke, TextItem, Point }
