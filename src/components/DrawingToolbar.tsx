import type { Tool } from '../types'
import { COLORS, WIDTHS } from '../lib/drawing'

type Props = {
  tool: Tool
  color: string
  width: number
  allowTyping: boolean
  canUndo: boolean
  onTool: (t: Tool) => void
  onColor: (c: string) => void
  onWidth: (w: number) => void
  onUndo: () => void
  onClear: () => void
}

const TOOLS: { id: Tool; label: string; needsTyping?: boolean }[] = [
  { id: 'pen', label: 'Pen' },
  { id: 'eraser', label: 'Eraser' },
  { id: 'line', label: 'Line' },
  { id: 'rect', label: 'Rect' },
  { id: 'ellipse', label: 'Oval' },
  { id: 'ruler', label: 'Ruler' },
  { id: 'text', label: 'Type', needsTyping: true },
]

export function DrawingToolbar({
  tool,
  color,
  width,
  allowTyping,
  canUndo,
  onTool,
  onColor,
  onWidth,
  onUndo,
  onClear,
}: Props) {
  return (
    <div className="toolbar">
      <div className="toolbar-group">
        {TOOLS.filter((t) => !t.needsTyping || allowTyping).map((t) => (
          <button
            key={t.id}
            type="button"
            className={tool === t.id ? 'tool active' : 'tool'}
            onClick={() => onTool(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="toolbar-group">
        {COLORS.map((c) => (
          <button
            key={c}
            type="button"
            className={color === c ? 'swatch active' : 'swatch'}
            style={{ background: c }}
            aria-label={`Colour ${c}`}
            onClick={() => onColor(c)}
          />
        ))}
      </div>
      <div className="toolbar-group">
        {WIDTHS.map((w) => (
          <button
            key={w}
            type="button"
            className={width === w ? 'tool active' : 'tool'}
            onClick={() => onWidth(w)}
          >
            {w}px
          </button>
        ))}
      </div>
      <div className="toolbar-group">
        <button type="button" className="tool" disabled={!canUndo} onClick={onUndo}>
          Undo
        </button>
        <button type="button" className="tool danger" onClick={onClear}>
          Clear
        </button>
      </div>
    </div>
  )
}
