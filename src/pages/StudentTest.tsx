import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { DrawingToolbar } from '../components/DrawingToolbar'
import { InkCanvas } from '../components/InkCanvas'
import { buildTestPdf, downloadBlob } from '../lib/pdf'
import { downloadSubmissionFile } from '../lib/backup'
import { encodePayload } from '../lib/share'
import { addSubmission, clearAttempt, getAttempt, saveAttempt, uid } from '../lib/storage'
import type { PageInk, QuestionType, Submission, Tool } from '../types'
import { loadActiveTest } from '../lib/session'

export function StudentTest() {
  const navigate = useNavigate()
  const bundle = useMemo(() => loadActiveTest(), [])
  const attempt = getAttempt()
  const [index, setIndex] = useState(0)
  const [pages, setPages] = useState<PageInk[]>(attempt?.pages ?? [])
  const [objectiveResponses, setObjectiveResponses] = useState<(string | null)[]>(
    attempt?.objectiveResponses ?? bundle?.test.questions.map(() => null) ?? [],
  )
  const [tool, setTool] = useState<Tool>(() => (bundle?.test.allowTyping ? 'text' : 'pen'))
  const [color, setColor] = useState('#0f172a')
  const [width, setWidth] = useState(4)
  const [busy, setBusy] = useState(false)
  const [doneMsg, setDoneMsg] = useState('')
  const [importToken, setImportToken] = useState('')
  const [lastSubmission, setLastSubmission] = useState<Submission | null>(null)

  useEffect(() => {
    if (!attempt || !bundle) return
    saveAttempt({ ...attempt, pages, objectiveResponses })
  }, [pages, objectiveResponses])

  if (!bundle || !attempt) {
    return <Navigate to="/join" replace />
  }

  const student = attempt
  const { test, teacherEmail, teacherName } = bundle
  const question = test.questions[index]
  const questionType: QuestionType = question?.type ?? 'written'
  const isObjective = questionType !== 'written'
  const page = pages[index] ?? { strokes: [], texts: [] }
  const selectedResponse = objectiveResponses[index] ?? null
  const objectiveOptions =
    questionType === 'trueFalse' ? ['True', 'False'] : question?.options ?? []

  function updatePage(next: PageInk) {
    setPages((all) => all.map((p, i) => (i === index ? next : p)))
  }

  function selectObjective(answer: string) {
    setObjectiveResponses((all) => {
      const next = all.length === test.questions.length ? all.slice() : test.questions.map((_, i) => all[i] ?? null)
      next[index] = answer
      return next
    })
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
      const sources = test.questions.map((q) => q.lockedSource ?? null)
      const questionTypes = test.questions.map((q) => q.type ?? 'written') as QuestionType[]
      const blob = await buildTestPdf({
        testTitle: test.title,
        studentName: student.studentName,
        prompts: test.questions.map((q) => q.prompt),
        pages,
        sources,
        questionTypes,
        objectiveResponses,
      })
      const filename = `${test.code}-${student.studentName.replace(/\s+/g, '_')}.pdf`
      downloadBlob(blob, filename)

      const submission: Submission = {
        id: uid('sub'),
        testId: test.id,
        testTitle: test.title,
        testCode: test.code,
        studentName: student.studentName,
        submittedAt: new Date().toISOString(),
        pages,
        questionPrompts: test.questions.map((q) => q.prompt),
        questionTypes,
        objectiveResponses,
        questionSources: sources,
      }

      addSubmission(submission)
      const token = encodePayload({ v: 1, kind: 'submission', submission })
      setImportToken(token)
      setLastSubmission(submission)
      downloadSubmissionFile(submission)

      const sendEmail = Boolean(test.emailOnSubmit) && Boolean(teacherEmail)
      if (sendEmail) {
        const subject = encodeURIComponent(`TestPro: ${test.title} — ${student.studentName}`)
        const body = encodeURIComponent(
          `Hi ${teacherName || 'teacher'},\n\n` +
            `${student.studentName} submitted "${test.title}" (${test.code}).\n` +
            `The PDF downloaded on the student device — please attach it to this email if it was not attached automatically.\n\n` +
            `Or import this token in Teacher → Submissions:\n${token.slice(0, 80)}…\n`,
        )
        window.location.href = `mailto:${teacherEmail}?subject=${subject}&body=${body}`
      }

      setDoneMsg(
        sendEmail
          ? 'PDF + JSON downloaded and email draft opened. Keep the import token or JSON file for your teacher.'
          : 'PDF + JSON downloaded. Give the JSON file or import token to your teacher.',
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
    <div className="sit sit-v2">
      <header className={`sit-compact-header${isObjective ? ' sit-compact-header-objective' : ''}`}>
        <div className="sit-question-copy">
          <div className="sit-meta-line">
            <span className="sit-eyebrow">{test.title}</span>
            <span className="sit-counter">Q{index + 1} / {test.questions.length}</span>
          </div>
          {!isObjective && <h1 className="sit-question-text">{question?.prompt}</h1>}
        </div>
        <nav className="sit-nav sit-nav-compact" aria-label="Question navigation">
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
            {busy ? 'Building…' : 'Submit'}
          </button>
        </nav>
      </header>

      {isObjective ? (
        <main className="sit-objective-stage">
          <section className="sit-objective-card">
            <span className="sit-objective-kind">
              {questionType === 'multipleChoice' ? 'Multiple choice' : 'True / False'}
            </span>
            <h1>{question?.prompt}</h1>

            {question?.lockedSource?.dataUrl && (
              <div className="sit-objective-source">
                <img
                  src={question.lockedSource.dataUrl}
                  alt={question.lockedSource.name || 'Question source'}
                />
              </div>
            )}

            <div
              className={`sit-objective-options${questionType === 'trueFalse' ? ' is-true-false' : ''}`}
              role="radiogroup"
              aria-label="Answer choices"
            >
              {objectiveOptions.map((option, optionIndex) => {
                const selected = selectedResponse === option
                const label = questionType === 'multipleChoice'
                  ? String.fromCharCode(65 + optionIndex)
                  : option === 'True' ? 'T' : 'F'
                return (
                  <button
                    key={`${optionIndex}-${option}`}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    className={`sit-objective-option${selected ? ' is-selected' : ''}`}
                    onClick={() => selectObjective(option)}
                  >
                    <span className="sit-option-label">{label}</span>
                    <span>{option}</span>
                  </button>
                )
              })}
            </div>
          </section>
        </main>
      ) : (
        <main className="sit-stage">
          <aside className="sit-tool-rail" aria-label="Student tools">
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
          </aside>

          <InkCanvas
            value={page}
            onChange={updatePage}
            allowTyping={test.allowTyping}
            tool={tool}
            color={color}
            width={width}
            lockedSource={question?.lockedSource}
          />
        </main>
      )}

      {doneMsg && (
        <div className="submit-done sit-done">
          <p>{doneMsg}</p>
          {importToken && (
            <textarea readOnly rows={3} value={importToken} onFocus={(e) => e.target.select()} />
          )}
          {lastSubmission && (
            <button
              type="button"
              className="btn ghost"
              onClick={() => downloadSubmissionFile(lastSubmission)}
            >
              Download JSON again
            </button>
          )}
          <Link className="btn ghost" to="/" onClick={() => navigate('/')}>
            Done
          </Link>
        </div>
      )}
    </div>
  )
}
