import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { DrawingToolbar } from '../components/DrawingToolbar'
import { InkCanvas } from '../components/InkCanvas'
import { buildTestPdf, downloadBlob } from '../lib/pdf'
import { encodePayload } from '../lib/share'
import { addSubmission, clearAttempt, getAttempt, saveAttempt, uid } from '../lib/storage'
import type { PageInk, Tool } from '../types'
import { loadActiveTest } from './StudentJoin'

export function StudentTest() {
  const navigate = useNavigate()
  const bundle = useMemo(() => loadActiveTest(), [])
  const attempt = getAttempt()
  const [index, setIndex] = useState(0)
  const [pages, setPages] = useState<PageInk[]>(attempt?.pages ?? [])
  const [tool, setTool] = useState<Tool>('pen')
  const [color, setColor] = useState('#0f172a')
  const [width, setWidth] = useState(4)
  const [busy, setBusy] = useState(false)
  const [doneMsg, setDoneMsg] = useState('')
  const [importToken, setImportToken] = useState('')

  useEffect(() => {
    if (!attempt || !bundle) return
    saveAttempt({ ...attempt, pages })
  }, [pages])

  if (!bundle || !attempt) {
    return <Navigate to="/join" replace />
  }

  const student = attempt
  const { test, teacherEmail, teacherName } = bundle
  const question = test.questions[index]
  const page = pages[index] ?? { strokes: [], texts: [] }

  function updatePage(next: PageInk) {
    setPages((all) => all.map((p, i) => (i === index ? next : p)))
  }

  function undo() {
    const p = pages[index]
    if (!p) return
    if (p.strokes.length) {
      updatePage({ ...p, strokes: p.strokes.slice(0, -1) })
    } else if (p.texts.length) {
      updatePage({ ...p, texts: p.texts.slice(0, -1) })
    }
  }

  async function submit() {
    setBusy(true)
    setDoneMsg('')
    try {
      const blob = await buildTestPdf({
        testTitle: test.title,
        studentName: student.studentName,
        prompts: test.questions.map((q) => q.prompt),
        pages,
      })
      const filename = `${test.code}-${student.studentName.replace(/\s+/g, '_')}.pdf`
      downloadBlob(blob, filename)

      const submission = {
        id: uid('sub'),
        testId: test.id,
        testTitle: test.title,
        testCode: test.code,
        studentName: student.studentName,
        submittedAt: new Date().toISOString(),
        pages,
        questionPrompts: test.questions.map((q) => q.prompt),
      }

      // Local inbox if teacher opens on same browser; always create import token
      addSubmission(submission)
      const token = encodePayload({ v: 1, kind: 'submission', submission })
      setImportToken(token)

      if (teacherEmail) {
        const subject = encodeURIComponent(`MathTester: ${test.title} — ${student.studentName}`)
        const body = encodeURIComponent(
          `Hi ${teacherName || 'teacher'},\n\n` +
            `${student.studentName} submitted "${test.title}" (${test.code}).\n` +
            `The PDF downloaded on the student device — please attach it to this email if it was not attached automatically.\n\n` +
            `Or import this token in Teacher → Submissions:\n${token.slice(0, 80)}…\n`,
        )
        window.location.href = `mailto:${teacherEmail}?subject=${subject}&body=${body}`
      }

      setDoneMsg(
        teacherEmail
          ? 'PDF downloaded and email draft opened. Keep the import token if your teacher asks for it.'
          : 'PDF downloaded. Give the import token to your teacher.',
      )
      clearAttempt()
    } catch (err) {
      console.error(err)
      setDoneMsg('Could not build the PDF. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="sit">
      <header className="sit-header">
        <div>
          <p className="eyebrow">{test.title}</p>
          <h1>
            Q{index + 1}
            <span className="muted"> / {test.questions.length}</span>
          </h1>
        </div>
        <div className="row gap">
          <button
            type="button"
            className="btn ghost"
            disabled={index === 0}
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
          >
            Prev
          </button>
          <button
            type="button"
            className="btn ghost"
            disabled={index >= test.questions.length - 1}
            onClick={() => setIndex((i) => Math.min(test.questions.length - 1, i + 1))}
          >
            Next
          </button>
          <button type="button" className="btn primary" disabled={busy} onClick={submit}>
            {busy ? 'Building PDF…' : 'Submit test'}
          </button>
        </div>
      </header>

      <p className="prompt">{question?.prompt}</p>

      <DrawingToolbar
        tool={tool}
        color={color}
        width={width}
        allowTyping={test.allowTyping}
        canUndo={page.strokes.length > 0 || page.texts.length > 0}
        onTool={setTool}
        onColor={setColor}
        onWidth={setWidth}
        onUndo={undo}
        onClear={() => updatePage({ strokes: [], texts: [] })}
      />

      <InkCanvas
        value={page}
        onChange={updatePage}
        allowTyping={test.allowTyping}
        tool={tool}
        color={color}
        width={width}
      />

      {doneMsg && (
        <div className="submit-done">
          <p>{doneMsg}</p>
          {importToken && (
            <textarea readOnly rows={3} value={importToken} onFocus={(e) => e.target.select()} />
          )}
          <Link className="btn ghost" to="/" onClick={() => navigate('/')}>
            Done
          </Link>
        </div>
      )}
    </div>
  )
}
