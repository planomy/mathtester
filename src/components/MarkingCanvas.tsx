import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { renderInkLayer } from '../lib/inkLayer'
import { drawLockedSource, loadLockedImage } from '../lib/lockedSource'
import { uid } from '../lib/storage'
import type { LockedSource, MarkTool, PageInk, Point, Stroke } from '../types'

type Props = {
  studentPage: PageInk
  marks: PageInk
  onChange: (marks: PageInk) => void
  tool: MarkTool
  lockedSource?: LockedSource | null
}

function dist(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function MarkingCanvas({ studentPage, marks, onChange, tool, lockedSource }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const drawing = useRef(false)
  const current = useRef<Stroke | null>(null)
  const studentRef = useRef(studentPage)
  const marksRef = useRef(marks)
  const bgImageRef = useRef<HTMLImageElement | null>(null)
  const bgReady = useRef(0)

  studentRef.current = studentPage
  marksRef.current = marks

  useEffect(() => {
    let cancelled = false
    bgImageRef.current = null
    if (!lockedSource?.dataUrl) {
      bgReady.current += 1
      paint()
      return
    }
    loadLockedImage(lockedSource.dataUrl)
      .then((img) => {
        if (cancelled) return
        bgImageRef.current = img
        bgReady.current += 1
        paint()
      })
      .catch(() => {
        if (cancelled) return
        bgImageRef.current = null
        paint()
      })
    return () => {
      cancelled = true
    }
  }, [lockedSource?.dataUrl])

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
    ctx.fillStyle = lockedSource ? '#ffffff' : '#f7f4ee'
    ctx.fillRect(0, 0, w, h)

    if (bgImageRef.current) {
      drawLockedSource(ctx, bgImageRef.current, 0, 0, w, h)
    } else if (!lockedSource) {
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.4)'
      ctx.lineWidth = 1
      for (let y = 36; y < h; y += 36) {
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(w, y)
        ctx.stroke()
      }
    }

    const ink = renderInkLayer(
      w,
      h,
      dpr,
      [studentRef.current, marksRef.current],
      current.current,
    )
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.drawImage(ink, 0, 0)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return

    let frame = 0
    const resize = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const w = Math.floor(wrap.clientWidth)
        const h = Math.floor(wrap.clientHeight)
        if (w < 2 || h < 2) return
        const dpr = Math.min(window.devicePixelRatio || 1, 2)
        const nextW = Math.floor(w * dpr)
        const nextH = Math.floor(h * dpr)
        if (canvas.width === nextW && canvas.height === nextH) {
          paint()
          return
        }
        canvas.width = nextW
        canvas.height = nextH
        paint()
      })
    }

    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)
    return () => {
      cancelAnimationFrame(frame)
      ro.disconnect()
    }
  }, [])

  useEffect(() => {
    paint()
  }, [studentPage, marks])

  function toLocal(e: ReactPointerEvent<HTMLCanvasElement>): Point {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
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
    paint()
  }

  function onPointerMove(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || !current.current) return
    const p = toLocal(e)
    const last = current.current.points[current.current.points.length - 1]
    if (last && dist(last, p) < 1.5) return
    current.current.points.push(p)
    paint()
  }

  function endStroke() {
    if (!drawing.current || !current.current) return
    drawing.current = false
    const stroke = current.current
    current.current = null
    if (stroke.points.length < 2) {
      paint()
      return
    }
    onChange({ ...marks, strokes: [...marks.strokes, stroke] })
  }

  return (
    <div className="ink-wrap mark-wrap" ref={wrapRef}>
      {lockedSource && (
        <div className="locked-source-badge">Locked source</div>
      )}
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
