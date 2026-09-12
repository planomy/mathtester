import { type FormEvent, useMemo, useRef, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { MarkingCanvas } from '../components/MarkingCanvas'
import {
  downloadSubmissionFile,
  downloadTeacherBackup,
  importSubmissionFromFile,
  restoreTeacherBackupFromFile,
} from '../lib/backup'
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
import type { LockedSource, MarkTool, PageInk, Submission } from '../types'

function ensureMarkPages(sub: Submission): PageInk[] {
  if (sub.markPages && sub.markPages.length === sub.pages.length) return sub.markPages
  return sub.pages.map(() => emptyInk())
}

const MARK_TOOLS: { id: MarkTool; label: string; title: string }[] = [
  { id: 'tick', label: '✓', title: 'Tick' },
  { id: 'cross', label: '✗', title: 'Cross' },
  { id: 'pen', label: 'Pen', title: 'Pen' },
  { id: 'text', label: 'Note', title: 'Note' },
  { id: 'eraser', label: 'Eraser', title: 'Eraser' },
]

export function TeacherSubmissions() {
  const teacher = getTeacher()
  if (!teacher || !hasTeacherSession()) {
    return <Navigate to="/teacher" replace />
  }

  const [subs, setSubs] = useState(() => getSubmissions())
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const [statusMsg, setStatusMsg] = useState('')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [pageIndex, setPageIndex] = useState(0)
  const [tool, setTool] = useState<MarkTool>('tick')
  const [busy, setBusy] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const backupInputRef = useRef<HTMLInputElement>(null)
  const submissionFileRef = useRef<HTMLInputElement>(null)

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

  const lockedSources = useMemo(() => {
    if (!active) return [] as (LockedSource | null | undefined)[]
    if (active.questionSources?.length) return active.questionSources
    const test =
      getTests().find((t) => t.id === active.testId) ||
      getTests().find((t) => t.code === active.testCode)
    return active.questionPrompts.map((_, i) => test?.questions[i]?.lockedSource)
  }, [active])

  function refresh() {
    setSubs(getSubmissions())
  }

  function flash(msg: string) {
    setStatusMsg(msg)
    setError('')
    window.setTimeout(() => setStatusMsg(''), 4000)
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
    flash(`Imported ${payload.submission.studentName}.`)
  }

  async function onRestoreBackup(file: File) {
    setError('')
    try {
      const result = await restoreTeacherBackupFromFile(file)
      refresh()
      flash(
        `Restored backup: ${result.submissions} submission(s), ${result.tests} test(s).`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not restore backup.')
    }
  }

  async function onImportSubmissionFile(file: File) {
    setError('')
    try {
      const submission = await importSubmissionFromFile(file)
      addSubmission(submission)
      refresh()
      setActiveId(submission.id)
      setPageIndex(0)
      setShowImport(false)
      flash(`Imported ${submission.studentName}.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not import file.')
    }
  }

  function updateActive(next: Submission) {
    upsertSubmission(next)
    setSubs((prev) => {
      const i = prev.findIndex((s) => s.id === next.id)
      if (i < 0) return [next, ...prev]
      const copy = prev.slice()
      copy[i] = next
      return copy
    })
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
        sources: lockedSources,
      })
      const safeName = marked.studentName.replace(/[^\w\- ]+/g, '').replace(/\s+/g, '_')
      downloadBlob(blob, `marked-${safeName}-${marked.testCode}.pdf`)
      flash('Marked PDF downloaded.')
    } finally {
      setBusy(false)
    }
  }

  const markPages = active ? ensureMarkPages(active) : []
  const currentMarks = markPages[pageIndex] ?? emptyInk()
  const currentStudent = active?.pages[pageIndex] ?? emptyInk()
  const answerText = active
    ? answers[pageIndex] || 'No answer in editor'
    : ''

  return (
    <div className="marking-page">
      <header className="marking-top marking-top-bar">
        <div className="marking-top-title">
          <Link className="marking-back" to="/teacher/dashboard">
            ← Tests
          </Link>
          <h1>Submissions</h1>
        </div>
        <div className="marking-top-actions">
          <button
            type="button"
            className="marking-quiet-action"
            onClick={() => {
              try {
                downloadTeacherBackup()
                flash('Backup downloaded.')
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Backup failed.')
              }
            }}
          >
            Backup
          </button>
          <button
            type="button"
            className="marking-quiet-action"
            onClick={() => backupInputRef.current?.click()}
          >
            Restore
          </button>
          <input
            ref={backupInputRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) void onRestoreBackup(file)
            }}
          />
          <button
            type="button"
            className="marking-quiet-action"
            onClick={() => setShowImport((v) => !v)}
          >
            {showImport ? 'Hide' : 'Import'}
          </button>
        </div>
      </header>

      {(statusMsg || error) && (
        <p className={error ? 'error marking-banner' : 'status-ok marking-banner'}>
          {error || statusMsg}
        </p>
      )}

      {showImport && (
        <form className="stack import-bar" onSubmit={onImport}>
          <label>
            Token
            <textarea
              rows={2}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Paste token"
            />
          </label>
          <div className="row gap wrap">
            <button className="btn primary" type="submit">
              Import token
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={() => submissionFileRef.current?.click()}
            >
              Import JSON
            </button>
            <input
              ref={submissionFileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (file) void onImportSubmissionFile(file)
              }}
            />
          </div>
        </form>
      )}

      <div className="marking-split">
        <aside className="marking-sidebar">
          <div className="sidebar-heading-row">
            <h2 className="sidebar-heading">Students</h2>
            <span className="sidebar-count">{subs.length}</span>
          </div>
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
                    <span className="sidebar-name">{s.studentName}</span>
                    <span className="sidebar-meta">
                      <span
                        className={
                          s.status === 'marked'
                            ? 'sidebar-chip marked'
                            : 'sidebar-chip received'
                        }
                      >
                        {s.status === 'marked' ? 'Marked' : 'Received'}
                      </span>
                      <span>{s.testCode}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="marking-main">
          {!active ? (
            <p className="empty marking-empty">Select a student.</p>
          ) : (
            <div className="marking">
              <header className="marking-student-bar">
                <div className="marking-student-title">
                  <h2>{active.studentName}</h2>
                  <p className="muted">
                    {active.testTitle} · Q{pageIndex + 1}/{active.pages.length}
                  </p>
                </div>
                <div className="marking-student-actions">
                  <div className="marking-pager" role="group" aria-label="Question">
                    <button
                      type="button"
                      className="btn ghost marking-pager-btn"
                      disabled={pageIndex === 0}
                      onClick={() => setPageIndex((i) => Math.max(0, i - 1))}
                    >
                      Prev
                    </button>
                    <button
                      type="button"
                      className="btn ghost marking-pager-btn"
                      disabled={pageIndex >= active.pages.length - 1}
                      onClick={() =>
                        setPageIndex((i) => Math.min(active.pages.length - 1, i + 1))
                      }
                    >
                      Next
                    </button>
                  </div>
                  <button
                    type="button"
                    className="marking-quiet-action"
                    onClick={() => {
                      downloadSubmissionFile(active)
                      flash('Student JSON downloaded.')
                    }}
                  >
                    JSON
                  </button>
                  <button
                    type="button"
                    className="btn primary"
                    disabled={busy}
                    onClick={saveMarkedAndDownload}
                  >
                    {busy ? 'Building…' : 'PDF'}
                  </button>
                </div>
              </header>

              <p className="prompt marking-prompt">{active.questionPrompts[pageIndex]}</p>

              <div className="marking-stage">
                <MarkingCanvas
                  studentPage={currentStudent}
                  marks={currentMarks}
                  onChange={setMarks}
                  tool={tool}
                  lockedSource={lockedSources[pageIndex]}
                />

                <div className="marking-float-bar" aria-label="Marking tools">
                  <div className="marking-answer-chip" title={answerText}>
                    <span>Answer</span>
                    <strong>{answerText}</strong>
                  </div>
                  <div className="toolbar marking-float-tools">
                    <div className="toolbar-group">
                      {MARK_TOOLS.map(({ id, label, title }) => (
                        <button
                          key={id}
                          type="button"
                          title={title}
                          aria-label={title}
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
                        Clear
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
