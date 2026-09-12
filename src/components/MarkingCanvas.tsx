import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
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
  const noteInputRef = useRef<HTMLTextAreaElement>(null)
  const drawing = useRef(false)
  const current = useRef<Stroke | null>(null)
  const studentRef = useRef(studentPage)
  const marksRef = useRef(marks)
  const bgImageRef = useRef<HTMLImageElement | null>(null)
  const bgReady = useRef(0)
  const ignoreNoteBlur = useRef(false)
  const [draftNote, setDraftNote] = useState<Point | null>(null)
  const [noteValue, setNoteValue] = useState('')

  studentRef.current = studentPage
  marksRef.current = marks

  useEffect(() => {
    setDraftNote(null)
    setNoteValue('')
  }, [tool])

  useEffect(() => {
    if (!draftNote) return
    ignoreNoteBlur.current = true
    const focusId = window.setTimeout(() => {
      noteInputRef.current?.focus()
      noteInputRef.current?.select()
      ignoreNoteBlur.current = false
    }, 0)
    const unlockId = window.setTimeout(() => {
      ignoreNoteBlur.current = false
    }, 200)
    return () => {
      window.clearTimeout(focusId)
      window.clearTimeout(unlockId)
    }
  }, [draftNote])

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

  function dismissNote() {
    setDraftNote(null)
    setNoteValue('')
  }

  function commitNote() {
    const text = noteValue.replace(/\s+$/g, '').replace(/^\s+/g, '')
    const at = draftNote
    if (!at || !text) {
      dismissNote()
      return
    }
    const canvas = canvasRef.current
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const pageW = canvas ? canvas.width / dpr : 800
    const maxWidth = Math.max(140, Math.min(320, pageW - at.x - 20))
    onChange({
      ...marksRef.current,
      texts: [
        ...marksRef.current.texts,
        {
          id: uid('mark'),
          x: at.x,
          y: at.y,
          text,
          color: '#b91c1c',
          size: 22,
          maxWidth,
        },
      ],
    })
    dismissNote()
  }

  function onPointerDown(e: ReactPointerEvent<HTMLCanvasElement>) {
    const p = toLocal(e)
    if (tool === 'tick' || tool === 'cross') {
      onChange({
        ...marksRef.current,
        texts: [
          ...marksRef.current.texts,
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
      // Keep the placing click from stealing focus from the note field.
      e.preventDefault()
      setDraftNote(p)
      setNoteValue('')
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
    onChange({ ...marksRef.current, strokes: [...marksRef.current.strokes, stroke] })
  }

  return (
    <div className="ink-wrap mark-wrap" ref={wrapRef}>
      {lockedSource && (
        <div className="locked-source-badge">Locked source</div>
      )}
      <canvas
        ref={canvasRef}
        className={tool === 'text' ? 'ink-canvas is-note' : 'ink-canvas'}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
      />
      {draftNote && (
        <form
          className="ink-text-form mark-note-form"
          style={{
            left: draftNote.x,
            top: draftNote.y,
            width: Math.min(
              320,
              Math.max(
                180,
                (canvasRef.current
                  ? canvasRef.current.getBoundingClientRect().width - draftNote.x - 16
                  : 280),
              ),
            ),
          }}
          onSubmit={(e) => {
            e.preventDefault()
            commitNote()
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <textarea
            ref={noteInputRef}
            rows={2}
            value={noteValue}
            onChange={(e) => setNoteValue(e.target.value)}
            onBlur={() => {
              if (ignoreNoteBlur.current) {
                noteInputRef.current?.focus()
                return
              }
              commitNote()
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault()
                dismissNote()
                return
              }
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                commitNote()
              }
            }}
            placeholder="Type note…"
            aria-label="Marking note"
          />
        </form>
      )}
    </div>
  )
}
