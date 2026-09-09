import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { PageInk, Point, Stroke, TextItem, Tool } from '../types'
import { uid } from '../lib/storage'

const COLORS = ['#0f172a', '#0f766e', '#b91c1c', '#1d4ed8', '#a16207']
const WIDTHS = [2, 4, 7, 12]

type Props = {
  value: PageInk
  onChange: (next: PageInk) => void
  allowTyping: boolean
  tool: Tool
  color: string
  width: number
}

function dist(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

type DrawTool = Exclude<Tool, 'text'>

export function InkCanvas({ value, onChange, allowTyping, tool, color, width }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const drawing = useRef(false)
  const current = useRef<Stroke | null>(null)
  const [draftText, setDraftText] = useState<{ x: number; y: number } | null>(null)
  const [textValue, setTextValue] = useState('')

  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return

    const resize = () => {
      const rect = wrap.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.floor(rect.width * dpr)
      canvas.height = Math.floor(rect.height * dpr)
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`
      paint()
    }

    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    paint()
  }, [value, draftText])

  function toLocal(e: ReactPointerEvent<HTMLCanvasElement>): Point {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    }
  }

  function paint() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const w = canvas.width / dpr
    const h = canvas.height / dpr

    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = '#f7f4ee'
    ctx.fillRect(0, 0, w, h)

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)'
    ctx.lineWidth = 1
    for (let y = 40; y < h; y += 36) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(w, y)
      ctx.stroke()
    }

    const strokes = current.current ? [...value.strokes, current.current] : value.strokes
    for (const s of strokes) paintStroke(ctx, s)
    for (const t of value.texts) {
      ctx.fillStyle = t.color
      ctx.font = `${t.size}px "Source Sans 3", system-ui, sans-serif`
      ctx.fillText(t.text, t.x, t.y)
    }
  }

  function paintStroke(ctx: CanvasRenderingContext2D, s: Stroke) {
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

  function onPointerDown(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (tool === 'text') {
      if (!allowTyping) return
      const p = toLocal(e)
      setDraftText(p)
      setTextValue('')
      return
    }
    e.currentTarget.setPointerCapture(e.pointerId)
    drawing.current = true
    const p = toLocal(e)
    const drawTool = tool as DrawTool
    current.current = {
      id: uid('stroke'),
      tool: drawTool,
      color,
      width: drawTool === 'eraser' ? Math.max(width * 3, 16) : width,
      points: [p],
    }
    paint()
  }

  function onPointerMove(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || !current.current) return
    const p = toLocal(e)
    const stroke = current.current
    if (stroke.tool === 'pen' || stroke.tool === 'eraser') {
      const last = stroke.points[stroke.points.length - 1]
      if (last && dist(last, p) < 1.5) return
      stroke.points.push(p)
    } else {
      stroke.points = [stroke.points[0], p]
    }
    paint()
  }

  function endStroke() {
    if (!drawing.current || !current.current) return
    drawing.current = false
    const stroke = current.current
    current.current = null
    if (stroke.points.length < 2 && stroke.tool !== 'pen') {
      paint()
      return
    }
    onChange({ ...value, strokes: [...value.strokes, stroke] })
  }

  function commitText() {
    if (!draftText || !textValue.trim()) {
      setDraftText(null)
      setTextValue('')
      return
    }
    const item: TextItem = {
      id: uid('text'),
      x: draftText.x,
      y: draftText.y,
      text: textValue.trim(),
      color,
      size: 22,
    }
    onChange({ ...value, texts: [...value.texts, item] })
    setDraftText(null)
    setTextValue('')
  }

  return (
    <div className="ink-wrap" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className="ink-canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
      />
      {draftText && (
        <form
          className="ink-text-form"
          style={{ left: draftText.x, top: draftText.y }}
          onSubmit={(e) => {
            e.preventDefault()
            commitText()
          }}
        >
          <input
            autoFocus
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            onBlur={commitText}
            placeholder="Type…"
          />
        </form>
      )}
    </div>
  )
}

export { COLORS, WIDTHS }
