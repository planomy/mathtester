import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { renderInkLayer } from '../lib/inkLayer'
import { drawLockedSource, loadLockedImage } from '../lib/lockedSource'
import { uid } from '../lib/storage'
import type { LockedSource, PageInk, Point, Stroke, TextItem, Tool } from '../types'

type Props = {
  value: PageInk
  onChange: (next: PageInk) => void
  allowTyping: boolean
  tool: Tool
  color: string
  width: number
  lockedSource?: LockedSource | null
}

function dist(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

type DrawTool = Exclude<Tool, 'text'>

export function InkCanvas({
  value,
  onChange,
  allowTyping,
  tool,
  color,
  width,
  lockedSource,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const drawing = useRef(false)
  const current = useRef<Stroke | null>(null)
  const bgImageRef = useRef<HTMLImageElement | null>(null)
  const [draftText, setDraftText] = useState<{ x: number; y: number } | null>(null)
  const [textValue, setTextValue] = useState('')
  const [bgReady, setBgReady] = useState(0)

  useEffect(() => {
    let cancelled = false
    bgImageRef.current = null
    if (!lockedSource?.dataUrl) {
      setBgReady((n) => n + 1)
      return
    }
    loadLockedImage(lockedSource.dataUrl)
      .then((img) => {
        if (cancelled) return
        bgImageRef.current = img
        setBgReady((n) => n + 1)
      })
      .catch(() => {
        if (cancelled) return
        bgImageRef.current = null
        setBgReady((n) => n + 1)
      })
    return () => {
      cancelled = true
    }
  }, [lockedSource?.dataUrl])

  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return

    const resize = () => {
      const w = Math.floor(wrap.clientWidth)
      const h = Math.floor(wrap.clientHeight)
      if (w < 2 || h < 2) return
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const nextW = Math.floor(w * dpr)
      const nextH = Math.floor(h * dpr)
      if (canvas.width !== nextW || canvas.height !== nextH) {
        canvas.width = nextW
        canvas.height = nextH
      }
      paint()
    }

    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    paint()
  }, [value, draftText, bgReady, lockedSource?.dataUrl])

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
    ctx.fillStyle = lockedSource ? '#ffffff' : '#f7f4ee'
    ctx.fillRect(0, 0, w, h)

    if (bgImageRef.current) {
      drawLockedSource(ctx, bgImageRef.current, 0, 0, w, h)
    } else if (!lockedSource) {
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)'
      ctx.lineWidth = 1
      for (let y = 40; y < h; y += 36) {
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(w, y)
        ctx.stroke()
      }
    } else {
      // source loading — faint grid
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)'
      ctx.lineWidth = 1
      for (let y = 40; y < h; y += 36) {
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(w, y)
        ctx.stroke()
      }
    }

    const ink = renderInkLayer(w, h, dpr, [{ strokes: value.strokes, texts: value.texts }], current.current)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.drawImage(ink, 0, 0)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
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
      {lockedSource && (
        <div className="locked-source-badge" title="Locked source — write over it; eraser will not remove it">
          Locked source{lockedSource.name ? `: ${lockedSource.name}` : ''}
        </div>
      )}
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

export { COLORS, WIDTHS } from '../lib/drawing'
