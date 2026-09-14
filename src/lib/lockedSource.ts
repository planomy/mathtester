import type { LockedSource } from '../types'

export type { LockedSource }

const MAX_EDGE = 1100
const JPEG_QUALITY = 0.72
export const SOURCE_WORKSPACE_RATIO = 0.7

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not load image'))
    img.src = src
  })
}

/** Shrink large photos/screenshots so share links stay usable. */
export async function compressImageDataUrl(dataUrl: string, name?: string): Promise<LockedSource> {
  const img = await loadImage(dataUrl)
  const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height))
  const w = Math.max(1, Math.round(img.width * scale))
  const h = Math.max(1, Math.round(img.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(img, 0, 0, w, h)
  return {
    kind: 'image',
    dataUrl: canvas.toDataURL('image/jpeg', JPEG_QUALITY),
    name: name || 'Source image',
  }
}

export async function fileToLockedSource(file: File): Promise<LockedSource> {
  const lower = file.name.toLowerCase()
  if (file.type === 'application/pdf' || lower.endsWith('.pdf')) {
    return pdfFileToLockedSource(file)
  }
  if (!file.type.startsWith('image/')) {
    throw new Error('Use an image or PDF file.')
  }
  const dataUrl = await readFileAsDataUrl(file)
  return compressImageDataUrl(dataUrl, file.name)
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Could not read file'))
    reader.readAsDataURL(file)
  })
}

/** Render the first page of a PDF to a locked background image. */
export async function pdfFileToLockedSource(file: File, pageNumber = 1): Promise<LockedSource> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString()

  const data = new Uint8Array(await file.arrayBuffer())
  const doc = await pdfjs.getDocument({ data }).promise
  const page = await doc.getPage(Math.min(Math.max(1, pageNumber), doc.numPages))
  const viewport = page.getViewport({ scale: 1.35 })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  const ctx = canvas.getContext('2d')!
  await page.render({ canvasContext: ctx, viewport, canvas }).promise
  const raw = canvas.toDataURL('image/jpeg', JPEG_QUALITY)
  return compressImageDataUrl(raw, file.name.replace(/\.pdf$/i, '') + ` (p${pageNumber})`)
}

export async function clipboardImageToLockedSource(
  items: DataTransferItemList | null | undefined,
): Promise<LockedSource | null> {
  if (!items) return null
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile()
      if (!file) continue
      return fileToLockedSource(file)
    }
  }
  return null
}

/** Draw locked source fitted into a rect (contain), white letterbox if needed. */
export function drawLockedSource(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const iw = 'naturalWidth' in img ? (img as HTMLImageElement).naturalWidth : (img as HTMLCanvasElement).width
  const ih = 'naturalHeight' in img ? (img as HTMLImageElement).naturalHeight : (img as HTMLCanvasElement).height
  if (!iw || !ih) return
  const scale = Math.min(w / iw, h / ih)
  const dw = iw * scale
  const dh = ih * scale
  const dx = x + (w - dw) / 2
  const dy = y + (h - dh) / 2
  ctx.save()
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(x, y, w, h)
  ctx.drawImage(img as CanvasImageSource, dx, dy, dw, dh)
  ctx.restore()
}

/**
 * Source questions keep one shared coordinate space, but reserve the bottom 30%
 * as a clear response area. This keeps student ink, teacher marking and PDFs aligned.
 */
export function drawLockedSourceWorkspace(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const sourceH = Math.floor(h * SOURCE_WORKSPACE_RATIO)
  const responseY = y + sourceH
  const responseH = Math.max(1, h - sourceH)

  drawLockedSource(ctx, img, x, y, w, sourceH)

  ctx.save()
  ctx.fillStyle = '#fbfaf7'
  ctx.fillRect(x, responseY, w, responseH)
  ctx.strokeStyle = '#94a3b8'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(x, responseY)
  ctx.lineTo(x + w, responseY)
  ctx.stroke()

  ctx.fillStyle = '#64748b'
  ctx.font = '700 12px "Source Sans 3", system-ui, sans-serif'
  ctx.fillText('YOUR RESPONSE', x + 16, responseY + 22)

  ctx.strokeStyle = 'rgba(148, 163, 184, 0.28)'
  ctx.lineWidth = 1
  for (let lineY = responseY + 42; lineY < y + h; lineY += 34) {
    ctx.beginPath()
    ctx.moveTo(x + 12, lineY)
    ctx.lineTo(x + w - 12, lineY)
    ctx.stroke()
  }
  ctx.restore()

  return { sourceH, responseY, responseH }
}

export function loadLockedImage(dataUrl: string): Promise<HTMLImageElement> {
  return loadImage(dataUrl)
}
