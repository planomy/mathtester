import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { renderInkLayer, wrapTextLines } from '../lib/inkLayer'
import {
  drawLockedSourceWorkspace,
  loadLockedImage,
  SOURCE_WORKSPACE_RATIO,
} from '../lib/lockedSource'
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
  const textInputRef = useRef<HTMLTextAreaElement>(null)
  const drawing = useRef(false)
  const current = useRef<Stroke | null>(null)
  const bgImageRef = useRef<HTMLImageElement | null>(null)
  const [draftText, setDraftText] = useState<{ x: number; y: number } | null>(null)
  const [editingTextId, setEditingTextId] = useState<string | null>(null)
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

  useEffect(() => {
    if (!draftText) return
    const frame = window.requestAnimationFrame(() => {
      textInputRef.current?.focus()
      if (editingTextId) textInputRef.current?.select()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [draftText, editingTextId])

  useEffect(() => {
    if (tool === 'text' && allowTyping) return
    cancelText()
  }, [tool, allowTyping])

  function toLocal(e: ReactPointerEvent<HTMLCanvasElement>): Point {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    }
  }

  function paintResponsePlaceholder(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const responseY = Math.floor(h * SOURCE_WORKSPACE_RATIO)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, responseY)
    ctx.fillStyle = '#fbfaf7'
    ctx.fillRect(0, responseY, w, h - responseY)
    ctx.strokeStyle = '#94a3b8'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(0, responseY)
    ctx.lineTo(w, responseY)
    ctx.stroke()
    ctx.fillStyle = '#64748b'
    ctx.font = '700 12px "Source Sans 3", system-ui, sans-serif'
    ctx.fillText('YOUR RESPONSE', 16, responseY + 22)
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.28)'
    ctx.lineWidth = 1
    for (let lineY = responseY + 42; lineY < h; lineY += 34) {
      ctx.beginPath()
      ctx.moveTo(12, lineY)
      ctx.lineTo(w - 12, lineY)
      ctx.stroke()
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

    if (lockedSource) {
      if (bgImageRef.current) {
        drawLockedSourceWorkspace(ctx, bgImageRef.current, 0, 0, w, h)
      } else {
        paintResponsePlaceholder(ctx, w, h)
      }
    } else {
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
    }

    const ink = renderInkLayer(w, h, dpr, [{ strokes: value.strokes, texts: value.texts }], current.current)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.drawImage(ink, 0, 0)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  function findTextAt(p: Point): TextItem | null {
    const canvas = canvasRef.current
    if (!canvas) return null
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    for (let i = value.texts.length - 1; i >= 0; i--) {
      const t = value.texts[i]
      ctx.font = `${t.size}px "Source Sans 3", system-ui, sans-serif`
      const lines = t.maxWidth || t.text.includes('\n')
        ? wrapTextLines(ctx, t.text, t.maxWidth ?? 10_000)
        : [t.text]
      const lineHeight = t.size * 1.28
      const textW = Math.max(36, ...lines.map((line) => ctx.measureText(line || ' ').width))
      const textH = Math.max(lineHeight, lines.length * lineHeight)
      const pad = 12
      if (
        p.x >= t.x - pad &&
        p.x <= t.x + textW + pad &&
        p.y >= t.y - t.size - pad &&
        p.y <= t.y - t.size + textH + pad
      ) {
        return t
      }
    }
    return null
  }

  function onPointerDown(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (tool === 'text') {
      if (!allowTyping) return
      e.preventDefault()
      e.stopPropagation()
      const p = toLocal(e)
      const existing = findTextAt(p)
      if (existing) {
        setDraftText({ x: existing.x, y: existing.y })
        setEditingTextId(existing.id)
        setTextValue(existing.text)
      } else {
        setDraftText(p)
        setEditingTextId(null)
        setTextValue('')
      }
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

  function cancelText() {
    setDraftText(null)
    setEditingTextId(null)
    setTextValue('')
  }

  function commitText() {
    if (!draftText) return
    const text = textValue.trim()

    if (editingTextId) {
      if (!text) {
        onChange({ ...value, texts: value.texts.filter((item) => item.id !== editingTextId) })
        cancelText()
        return
      }
      onChange({
        ...value,
        texts: value.texts.map((item) =>
          item.id === editingTextId ? { ...item, text } : item,
        ),
      })
      cancelText()
      return
    }

    if (!text) {
      cancelText()
      return
    }

    const canvas = canvasRef.current
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const pageW = canvas ? canvas.width / dpr : 900
    const maxWidth = Math.max(180, Math.min(620, pageW - draftText.x - 28))
    const item: TextItem = {
      id: uid('text'),
      x: draftText.x,
      y: draftText.y,
      text,
      color,
      size: 22,
      maxWidth,
    }
    onChange({ ...value, texts: [...value.texts, item] })
    cancelText()
  }

  const textMode = tool === 'text' && allowTyping
  const editorRect = canvasRef.current?.getBoundingClientRect()
  const editorWidth = draftText && editorRect
    ? Math.min(620, Math.max(240, editorRect.width - draftText.x - 24))
    : 360
  const editorTop = draftText && editorRect
    ? Math.min(draftText.y, Math.max(12, editorRect.height - 150))
    : draftText?.y ?? 0

  return (
    <div className="ink-wrap" ref={wrapRef}>
      {lockedSource && (
        <div className="locked-source-badge" title="Locked source with response area">
          Source · response below
        </div>
      )}
      <canvas
        ref={canvasRef}
        className={textMode ? 'ink-canvas is-note' : 'ink-canvas'}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
      />
      {draftText && (
        <form
          className="ink-text-form student-text-editor"
          style={{ left: draftText.x, top: editorTop, width: editorWidth }}
          onSubmit={(e) => {
            e.preventDefault()
            commitText()
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <textarea
            ref={textInputRef}
            rows={3}
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            onBlur={commitText}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault()
                cancelText()
                return
              }
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                commitText()
              }
            }}
            placeholder="Type your response…"
            aria-label={editingTextId ? 'Edit response text' : 'Type response text'}
          />
          <span className="student-text-hint">Ctrl/Cmd + Enter to place · click placed text to edit</span>
        </form>
      )}
    </div>
  )
}

export { COLORS, WIDTHS } from '../lib/drawing'
