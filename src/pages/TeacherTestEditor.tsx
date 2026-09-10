import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import {
  fileToLockedSource,
} from '../lib/lockedSource'
import { absoluteJoinUrl, encodePayload, type SharedTestPayload } from '../lib/share'
import {
  deleteTest,
  getTeacher,
  getTests,
  hasTeacherSession,
  makeCode,
  uid,
  upsertTest,
} from '../lib/storage'
import type { Question, Test } from '../types'

function blankQuestion(): Question {
  return { id: uid('q'), prompt: '', answer: '' }
}

export function TeacherTestEditor() {
  const { testId } = useParams()
  const navigate = useNavigate()
  const teacher = getTeacher()
  const existing = useMemo(
    () => (testId && testId !== 'new' ? getTests().find((t) => t.id === testId) : null),
    [testId],
  )

  const [title, setTitle] = useState(existing?.title ?? 'Untitled test')
  const [questions, setQuestions] = useState<Question[]>(
    existing?.questions?.length ? existing.questions : [blankQuestion()],
  )
  const [allowTyping, setAllowTyping] = useState(existing?.allowTyping ?? true)
  const [shareUrl, setShareUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const [focusQuestionId, setFocusQuestionId] = useState<string | null>(null)
  const [sourceBusyId, setSourceBusyId] = useState<string | null>(null)
  const [sourceError, setSourceError] = useState('')
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  async function attachSource(questionId: string, file: File) {
    setSourceError('')
    setSourceBusyId(questionId)
    try {
      const lockedSource = await fileToLockedSource(file)
      setQuestions((all) =>
        all.map((x) => (x.id === questionId ? { ...x, lockedSource } : x)),
      )
    } catch (err) {
      setSourceError(err instanceof Error ? err.message : 'Could not attach source.')
    } finally {
      setSourceBusyId(null)
    }
  }

  async function pasteSource(questionId: string) {
    setSourceError('')
    setSourceBusyId(questionId)
    try {
      const items = await navigator.clipboard.read()
      for (const item of items) {
        const type = item.types.find((t) => t.startsWith('image/'))
        if (!type) continue
        const blob = await item.getType(type)
        const file = new File([blob], 'pasted-image.png', { type: blob.type })
        const lockedSource = await fileToLockedSource(file)
        setQuestions((all) =>
          all.map((x) => (x.id === questionId ? { ...x, lockedSource } : x)),
        )
        return
      }
      setSourceError('No image on clipboard. Copy a screenshot first, or upload a file.')
    } catch {
      setSourceError('Clipboard paste blocked — use Upload image/PDF instead.')
    } finally {
      setSourceBusyId(null)
    }
  }

  function clearSource(questionId: string) {
    setQuestions((all) =>
      all.map((x) => {
        if (x.id !== questionId) return x
        const { lockedSource: _, ...rest } = x
        return rest
      }),
    )
  }

  useEffect(() => {
    if (!focusQuestionId) return
    const el = document.getElementById(`question-${focusQuestionId}`)
    const input = el?.querySelector('textarea')
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    input?.focus()
    setFocusQuestionId(null)
  }, [focusQuestionId, questions])

  if (!teacher || !hasTeacherSession()) {
    return <Navigate to="/teacher" replace />
  }

  function buildTest(published: boolean, code?: string): Test {
    const now = new Date().toISOString()
    return {
      id: existing?.id ?? uid('test'),
      title: title.trim() || 'Untitled test',
      questions: questions
        .map((q) => ({
          ...q,
          prompt: q.prompt.trim(),
          answer: (q.answer ?? '').trim(),
        }))
        .filter((q) => q.prompt.length > 0),
      allowTyping,
      code: code ?? existing?.code ?? makeCode(),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      published,
    }
  }

  function onSave(e: FormEvent) {
    e.preventDefault()
    const test = buildTest(existing?.published ?? false)
    if (test.questions.length === 0) return
    upsertTest(test)
    navigate(`/teacher/tests/${test.id}`, { replace: true })
  }

  function onPublish() {
    const test = buildTest(true, existing?.code ?? makeCode())
    if (test.questions.length === 0) return
    upsertTest(test)

    const payload: SharedTestPayload = {
      v: 1,
      kind: 'test',
      test: {
        id: test.id,
        title: test.title,
        // Strip teacher answers — students must never receive them
        questions: test.questions.map(({ id, prompt, lockedSource }) => ({
          id,
          prompt,
          lockedSource,
        })),
        allowTyping: test.allowTyping,
        code: test.code,
        createdAt: test.createdAt,
      },
      teacherEmail: teacher!.email,
      teacherName: teacher!.name,
    }
    const data = encodePayload(payload)
    const url = absoluteJoinUrl(test.code, data)
    setShareUrl(url)
  }

  async function copyLink() {
    if (!shareUrl) return
    await navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="page">
      <Link className="back" to="/teacher/dashboard">
        ← Dashboard
      </Link>
      <h1>{existing ? 'Edit test' : 'New test'}</h1>

      <form className="stack" onSubmit={onSave}>
        <label>
          Test title
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>

        <label className="check">
          <input
            type="checkbox"
            checked={allowTyping}
            onChange={(e) => setAllowTyping(e.target.checked)}
          />
          Allow typing tool on student canvas
        </label>

        <div className="section-head">
          <h2>Questions</h2>
        </div>

        {questions.map((q, i) => (
          <div key={q.id} className="question-edit" id={`question-${q.id}`}>
            <div className="row-between">
              <strong>Q{i + 1}</strong>
              {questions.length > 1 && (
                <button
                  type="button"
                  className="linkish"
                  onClick={() => setQuestions((all) => all.filter((x) => x.id !== q.id))}
                >
                  Remove
                </button>
              )}
            </div>
            <textarea
              rows={3}
              placeholder="e.g. Show that the sum of angles in a triangle is 180°."
              value={q.prompt}
              onChange={(e) =>
                setQuestions((all) =>
                  all.map((x) => (x.id === q.id ? { ...x, prompt: e.target.value } : x)),
                )
              }
            />
            <label className="answer-field">
              Teacher answer / marking guide
              <span className="muted"> (students never see this)</span>
              <textarea
                rows={2}
                placeholder="Expected working or final answer…"
                value={q.answer ?? ''}
                onChange={(e) =>
                  setQuestions((all) =>
                    all.map((x) => (x.id === q.id ? { ...x, answer: e.target.value } : x)),
                  )
                }
              />
            </label>

            <div className="locked-source-edit">
              <div className="row-between wrap">
                <strong>Locked source</strong>
                <span className="muted">Image or PDF page — kids write over it</span>
              </div>
              {q.lockedSource ? (
                <div className="locked-source-preview">
                  <img src={q.lockedSource.dataUrl} alt={q.lockedSource.name || 'Locked source'} />
                  <div className="row gap wrap">
                    <span className="muted">{q.lockedSource.name || 'Source attached'}</span>
                    <button
                      type="button"
                      className="linkish"
                      onClick={() => clearSource(q.id)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ) : (
                <div className="row gap wrap">
                  <input
                    ref={(el) => {
                      fileInputRefs.current[q.id] = el
                    }}
                    type="file"
                    accept="image/*,application/pdf,.pdf"
                    hidden
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      e.target.value = ''
                      if (file) void attachSource(q.id, file)
                    }}
                  />
                  <button
                    type="button"
                    className="btn ghost"
                    disabled={sourceBusyId === q.id}
                    onClick={() => fileInputRefs.current[q.id]?.click()}
                  >
                    {sourceBusyId === q.id ? 'Attaching…' : 'Upload image / PDF'}
                  </button>
                  <button
                    type="button"
                    className="btn ghost"
                    disabled={sourceBusyId === q.id}
                    onClick={() => void pasteSource(q.id)}
                  >
                    Paste image
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}

        {sourceError && <p className="error">{sourceError}</p>}

        <button
          type="button"
          className="btn ghost"
          onClick={() => {
            const next = blankQuestion()
            setQuestions((q) => [...q, next])
            setFocusQuestionId(next.id)
          }}
        >
          Add question
        </button>

        <div className="row gap wrap">
          <button className="btn primary" type="submit">
            Save
          </button>
          <button className="btn ghost" type="button" onClick={onPublish}>
            Publish & get student link
          </button>
          {existing && (
            <button
              className="btn danger"
              type="button"
              onClick={() => {
                deleteTest(existing.id)
                navigate('/teacher/dashboard')
              }}
            >
              Delete
            </button>
          )}
        </div>
      </form>

      {(shareUrl || existing?.published) && (
        <section className="share-box">
          <h2>Student access</h2>
          <p className="muted">
            Share the link or QR it on the board. Join code:{' '}
            <strong>{existing?.code ?? shareUrl.match(/join\/([^?]+)/)?.[1]}</strong>
          </p>
          {shareUrl && (
            <>
              <textarea readOnly rows={4} value={shareUrl} />
              <button type="button" className="btn primary" onClick={copyLink}>
                {copied ? 'Copied' : 'Copy link'}
              </button>
            </>
          )}
          {!shareUrl && existing?.published && (
            <button type="button" className="btn ghost" onClick={onPublish}>
              Refresh share link
            </button>
          )}
        </section>
      )}
    </div>
  )
}
