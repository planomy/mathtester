import { type FormEvent, useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { MarkingCanvas } from '../components/MarkingCanvas'
import { buildTestPdf, downloadBlob, emptyInk } from '../lib/pdf'
import { decodePayload } from '../lib/share'
import {
  addSubmission,
  getSubmissions,
  getTeacher,
  getTests,
  hasTeacherSession,
  upsertSubmission,
} from '../lib/storage'
import type { MarkTool, PageInk, Submission } from '../types'

function ensureMarkPages(sub: Submission): PageInk[] {
  if (sub.markPages && sub.markPages.length === sub.pages.length) return sub.markPages
  return sub.pages.map(() => emptyInk())
}

export function TeacherSubmissions() {
  const teacher = getTeacher()
  if (!teacher || !hasTeacherSession()) {
    return <Navigate to="/teacher" replace />
  }

  const [subs, setSubs] = useState(() => getSubmissions())
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [pageIndex, setPageIndex] = useState(0)
  const [tool, setTool] = useState<MarkTool>('tick')
  const [busy, setBusy] = useState(false)
  const [showImport, setShowImport] = useState(false)

  const active = useMemo(
    () => subs.find((s) => s.id === activeId) ?? null,
    [subs, activeId],
  )

  const answers = useMemo(() => {
    if (!active) return [] as string[]
    const test =
      getTests().find((t) => t.id === active.testId) ||
      getTests().find((t) => t.code === active.testCode)
    return active.questionPrompts.map((_, i) => test?.questions[i]?.answer?.trim() || '')
  }, [active])

  function refresh() {
    setSubs(getSubmissions())
  }

  function onImport(e: FormEvent) {
    e.preventDefault()
    setError('')
    const payload = decodePayload(token.trim())
    if (!payload || payload.kind !== 'submission') {
      setError('Not a valid submission token.')
      return
    }
    addSubmission(payload.submission)
    refresh()
    setActiveId(payload.submission.id)
    setPageIndex(0)
    setToken('')
    setShowImport(false)
  }

  function updateActive(next: Submission) {
    upsertSubmission(next)
    refresh()
  }

  function setMarks(marks: PageInk) {
    if (!active) return
    const markPages = ensureMarkPages(active).map((p, i) => (i === pageIndex ? marks : p))
    updateActive({ ...active, markPages })
  }

  function undoMark() {
    if (!active) return
    const marks = ensureMarkPages(active)[pageIndex]
    if (marks.texts.length) {
      setMarks({ ...marks, texts: marks.texts.slice(0, -1) })
    } else if (marks.strokes.length) {
      setMarks({ ...marks, strokes: marks.strokes.slice(0, -1) })
    }
  }

  async function saveMarkedAndDownload() {
    if (!active) return
    setBusy(true)
    try {
      const marked: Submission = {
        ...active,
        markPages: ensureMarkPages(active),
        status: 'marked',
        markedAt: new Date().toISOString(),
      }
      updateActive(marked)

      const blob = await buildTestPdf({
        testTitle: marked.testTitle,
        studentName: marked.studentName,
        prompts: marked.questionPrompts,
        pages: marked.pages,
        markPages: marked.markPages,
        marked: true,
      })
      const safeName = marked.studentName.replace(/[^\w\- ]+/g, '').replace(/\s+/g, '_')
      downloadBlob(blob, `marked-${safeName}-${marked.testCode}.pdf`)
    } finally {
      setBusy(false)
    }
  }

  const markPages = active ? ensureMarkPages(active) : []
  const currentMarks = markPages[pageIndex] ?? emptyInk()
  const currentStudent = active?.pages[pageIndex] ?? emptyInk()

  return (
    <div className="marking-page">
      <header className="marking-top">
        <div>
          <Link className="back" to="/teacher/dashboard">
            ← Dashboard
          </Link>
          <h1>Submissions</h1>
        </div>
        <button
          type="button"
          className="btn ghost"
          onClick={() => setShowImport((v) => !v)}
        >
          {showImport ? 'Hide import' : 'Import token'}
        </button>
      </header>

      {showImport && (
        <form className="stack import-bar" onSubmit={onImport}>
          <label>
            Import token
            <textarea
              rows={2}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Paste token from student submit screen"
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button className="btn primary" type="submit">
            Import
          </button>
        </form>
      )}

      <div className="marking-split">
        <aside className="marking-sidebar">
          <h2 className="sidebar-heading">Students</h2>
          {subs.length === 0 ? (
            <p className="empty compact">No submissions yet.</p>
          ) : (
            <ul className="list sidebar-list">
              {subs.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className={s.id === activeId ? 'list-btn active' : 'list-btn'}
                    onClick={() => {
                      setActiveId(s.id)
                      setPageIndex(0)
                    }}
                  >
                    <strong>{s.studentName}</strong>
                    <span>
                      {s.status === 'marked' ? 'Marked' : 'Received'} · {s.testCode}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="marking-main">
          {!active ? (
            <p className="empty">Select a student on the left to start marking.</p>
          ) : (
            <div className="marking">
              <header className="row-between wrap">
                <div>
                  <h2>{active.studentName}</h2>
                  <p className="muted">
                    {active.testTitle} · Q{pageIndex + 1}/{active.pages.length}
                  </p>
                </div>
                <div className="row gap wrap">
                  <button
                    type="button"
                    className="btn ghost"
                    disabled={pageIndex === 0}
                    onClick={() => setPageIndex((i) => Math.max(0, i - 1))}
                  >
                    Prev
                  </button>
                  <button
                    type="button"
                    className="btn ghost"
                    disabled={pageIndex >= active.pages.length - 1}
                    onClick={() => setPageIndex((i) => Math.min(active.pages.length - 1, i + 1))}
                  >
                    Next
                  </button>
                  <button
                    type="button"
                    className="btn primary"
                    disabled={busy}
                    onClick={saveMarkedAndDownload}
                  >
                    {busy ? 'Building…' : 'Mark done & download PDF'}
                  </button>
                </div>
              </header>

              <div className="answer-key">
                <strong>Teacher answer</strong>
                <p>
                  {answers[pageIndex] ||
                    'No answer saved for this question — add it in the test editor.'}
                </p>
              </div>

              <div className="toolbar">
                <div className="toolbar-group">
                  {(
                    [
                      ['tick', '✓ Tick'],
                      ['cross', '✗ Cross'],
                      ['pen', 'Pen'],
                      ['text', 'Note'],
                      ['eraser', 'Eraser'],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      className={tool === id ? 'tool active' : 'tool'}
                      onClick={() => setTool(id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="toolbar-group">
                  <button type="button" className="tool" onClick={undoMark}>
                    Undo
                  </button>
                  <button
                    type="button"
                    className="tool danger"
                    onClick={() => setMarks(emptyInk())}
                  >
                    Clear marks
                  </button>
                </div>
              </div>

              <p className="prompt">{active.questionPrompts[pageIndex]}</p>

              <MarkingCanvas
                studentPage={currentStudent}
                marks={currentMarks}
                onChange={setMarks}
                tool={tool}
                prompt={active.questionPrompts[pageIndex] || ''}
              />
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
