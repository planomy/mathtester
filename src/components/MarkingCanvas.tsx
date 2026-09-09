import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { uid } from '../lib/storage'
import type { MarkTool, PageInk, Point, Stroke } from '../types'

type Props = {
  studentPage: PageInk
  marks: PageInk
  onChange: (marks: PageInk) => void
  tool: MarkTool
  prompt: string
}

function dist(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function paintPage(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  student: PageInk,
  marks: PageInk,
  draft: Stroke | null,
) {
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = '#f7f4ee'
  ctx.fillRect(0, 0, w, h)
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.4)'
  ctx.lineWidth = 1
  for (let y = 36; y < h; y += 36) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(w, y)
    ctx.stroke()
  }

  const all = [...student.strokes, ...marks.strokes, ...(draft ? [draft] : [])]
  for (const s of all) {
    if (s.points.length < 2 && s.tool === 'pen') continue
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
    ctx.moveTo(s.points[0].x, s.points[0].y)
    for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i].x, s.points[i].y)
    ctx.stroke()
    ctx.restore()
  }

  for (const t of [...student.texts, ...marks.texts]) {
    ctx.fillStyle = t.color
    ctx.font = `${t.size}px "Source Sans 3", system-ui, sans-serif`
    ctx.fillText(t.text, t.x, t.y)
  }
}

export function MarkingCanvas({ studentPage, marks, onChange, tool }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const drawing = useRef(false)
  const current = useRef<Stroke | null>(null)

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
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      paintPage(ctx, rect.width, rect.height, studentPage, marks, current.current)
    }

    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [studentPage, marks])

  function toLocal(e: ReactPointerEvent<HTMLCanvasElement>): Point {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function repaint() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    paintPage(ctx, canvas.width / dpr, canvas.height / dpr, studentPage, marks, current.current)
  }

  function onPointerDown(e: ReactPointerEvent<HTMLCanvasElement>) {
    const p = toLocal(e)
    if (tool === 'tick' || tool === 'cross') {
      onChange({
        ...marks,
        texts: [
          ...marks.texts,
          {
            id: uid('mark'),
            x: p.x - 12,
            y: p.y + 12,
            text: tool === 'tick' ? '✓' : '✗',
            color: tool === 'tick' ? '#15803d' : '#b91c1c',
            size: 56,
          },
        ],
      })
      return
    }
    if (tool === 'text') {
      const note = window.prompt('Comment')
      if (!note?.trim()) return
      onChange({
        ...marks,
        texts: [
          ...marks.texts,
          {
            id: uid('mark'),
            x: p.x,
            y: p.y,
            text: note.trim(),
            color: '#b91c1c',
            size: 22,
          },
        ],
      })
      return
    }

    e.currentTarget.setPointerCapture(e.pointerId)
    drawing.current = true
    current.current = {
      id: uid('stroke'),
      tool: tool === 'eraser' ? 'eraser' : 'pen',
      color: '#b91c1c',
      width: tool === 'eraser' ? 22 : 4,
      points: [p],
    }
    repaint()
  }

  function onPointerMove(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || !current.current) return
    const p = toLocal(e)
    const last = current.current.points[current.current.points.length - 1]
    if (last && dist(last, p) < 1.5) return
    current.current.points.push(p)
    repaint()
  }

  function endStroke() {
    if (!drawing.current || !current.current) return
    drawing.current = false
    const stroke = current.current
    current.current = null
    if (stroke.points.length < 2) {
      repaint()
      return
    }
    onChange({ ...marks, strokes: [...marks.strokes, stroke] })
  }

  return (
    <div className="ink-wrap mark-wrap" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className="ink-canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
      />
    </div>
  )
}
