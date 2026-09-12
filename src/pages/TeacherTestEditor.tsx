import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
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

function editorSnapshot(
  title: string,
  questions: Question[],
  allowTyping: boolean,
  emailOnSubmit: boolean,
) {
  return JSON.stringify({ title, questions, allowTyping, emailOnSubmit })
}

type AiSettings = {
  yearLevel: string
  topic: string
  questionCount: string
  difficulty: string
}

const defaultAiSettings: AiSettings = {
  yearLevel: '5',
  topic: '',
  questionCount: '10',
  difficulty: 'Moderate',
}

function makeAiPrompt(settings: AiSettings) {
  const yearLevel = settings.yearLevel.trim() || '[YEAR LEVEL]'
  const topic = settings.topic.trim() || '[SUBJECT OR TOPIC]'
  const questionCount = settings.questionCount.trim() || '[NUMBER]'
  const difficulty = settings.difficulty.trim() || 'Moderate'

  return `Create a ${questionCount}-question test for Australian Year ${yearLevel} students about ${topic}.

Difficulty: ${difficulty}

Make every question clear and self-contained. Include an accurate teacher answer or concise marking guide for every question. If a question is multiple choice, put all answer options inside the question prompt.

Return only valid JSON using exactly this structure:
{
  "title": "Test title",
  "allowTyping": true,
  "questions": [
    {
      "prompt": "Question 1",
      "answer": "Teacher answer or marking guide"
    }
  ]
}

Do not include explanations, introductory text or Markdown code fences.`
}

function asText(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map(asText).filter(Boolean).join('\n')
  return ''
}

function parseAiTest(raw: string) {
  const trimmed = raw.trim()
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('No test JSON found. Paste the complete AI response.')

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed.slice(start, end + 1))
  } catch {
    throw new Error('That response is not valid JSON. Ask the AI to return only the JSON block.')
  }

  if (!parsed || typeof parsed !== 'object') throw new Error('That response does not contain a test.')
  const data = parsed as Record<string, unknown>
  if (!Array.isArray(data.questions)) throw new Error('No questions were found in that response.')

  const questions = data.questions
    .map((item): Question | null => {
      if (!item || typeof item !== 'object') return null
      const question = item as Record<string, unknown>
      const prompt = asText(question.prompt ?? question.question ?? question.text)
      if (!prompt) return null
      const answer = asText(
        question.answer ?? question.markingGuide ?? question.marking_guide ?? question.expectedAnswer,
      )
      return { id: uid('q'), prompt, answer }
    })
    .filter((question): question is Question => question !== null)

  if (questions.length === 0) throw new Error('No usable questions were found in that response.')

  return {
    title: asText(data.title ?? data.testTitle ?? data.name) || 'AI-created test',
    allowTyping: typeof data.allowTyping === 'boolean' ? data.allowTyping : true,
    questions,
  }
}

export function TeacherTestEditor({
  embedded = false,
}: {
  embedded?: boolean
} = {}) {
  const { testId: paramId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const testId =
    paramId ??
    (location.pathname.includes('/dashboard/new') ? 'new' : undefined)
  const teacher = getTeacher()
  const existing = useMemo(
    () => (testId && testId !== 'new' ? getTests().find((t) => t.id === testId) : null),
    [testId],
  )

  const [title, setTitle] = useState(existing?.title ?? 'Test name')
  const [questions, setQuestions] = useState<Question[]>(
    existing?.questions?.length ? existing.questions : [blankQuestion()],
  )
  const [allowTyping, setAllowTyping] = useState(existing?.allowTyping ?? true)
  const [emailOnSubmit, setEmailOnSubmit] = useState(existing?.emailOnSubmit ?? false)
  const [shareUrl, setShareUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const [focusQuestionId, setFocusQuestionId] = useState<string | null>(null)
  const [sourceBusyId, setSourceBusyId] = useState<string | null>(null)
  const [sourceError, setSourceError] = useState('')
  const [showAiBuilder, setShowAiBuilder] = useState(false)
  const [aiSettings, setAiSettings] = useState<AiSettings>(defaultAiSettings)
  const [aiPrompt, setAiPrompt] = useState(() => makeAiPrompt(defaultAiSettings))
  const [aiResponse, setAiResponse] = useState('')
  const [aiStatus, setAiStatus] = useState('')
  const [aiError, setAiError] = useState('')
  const [aiCopied, setAiCopied] = useState(false)
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(() =>
    existing
      ? editorSnapshot(
          existing.title,
          existing.questions?.length ? existing.questions : [blankQuestion()],
          existing.allowTyping ?? true,
          existing.emailOnSubmit ?? false,
        )
      : null,
  )
  const [isPublished, setIsPublished] = useState(existing?.published ?? false)
  const [saveStatus, setSaveStatus] = useState('')
  const [publishReminder, setPublishReminder] = useState('')
  const [shareRevealCount, setShareRevealCount] = useState(0)
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const shareBoxRef = useRef<HTMLElement | null>(null)
  const copyLinkRef = useRef<HTMLButtonElement | null>(null)
  const currentSnapshot = useMemo(
    () => editorSnapshot(title, questions, allowTyping, emailOnSubmit),
    [title, questions, allowTyping, emailOnSubmit],
  )
  const isSaved = savedSnapshot !== null && savedSnapshot === currentSnapshot

  function updateAiSetting(key: keyof AiSettings, value: string) {
    const next = { ...aiSettings, [key]: value }
    setAiSettings(next)
    setAiPrompt(makeAiPrompt(next))
  }

  async function copyAiPrompt() {
    setAiError('')
    try {
      await navigator.clipboard.writeText(aiPrompt)
      setAiCopied(true)
      setTimeout(() => setAiCopied(false), 1500)
    } catch {
      setAiError('Copy was blocked. Select the prompt and copy it manually.')
    }
  }

  function importAiResponse() {
    setAiError('')
    setAiStatus('')
    try {
      const imported = parseAiTest(aiResponse)
      setTitle(imported.title)
      setQuestions(imported.questions)
      setAllowTyping(imported.allowTyping)
      setAiResponse('')
      setShowAiBuilder(false)
      setAiStatus(
        `${imported.questions.length} questions imported with answers. Review them, then save and publish.`,
      )
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Could not import that response.')
    }
  }

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

  useEffect(() => {
    if (shareRevealCount === 0) return
    const frame = window.requestAnimationFrame(() => {
      shareBoxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      copyLinkRef.current?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [shareRevealCount])

  if (!teacher || !hasTeacherSession()) {
    return <Navigate to="/teacher" replace />
  }

  function buildTest(published: boolean, code?: string): Test {
    const now = new Date().toISOString()
    return {
      id: existing?.id ?? uid('test'),
      title: title.trim() || 'Test name',
      questions: questions
        .map((q) => ({
          ...q,
          prompt: q.prompt.trim(),
          answer: (q.answer ?? '').trim(),
        }))
        .filter((q) => q.prompt.length > 0),
      allowTyping,
      emailOnSubmit,
      code: code ?? existing?.code ?? makeCode(),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      published,
    }
  }

  function goDashboard() {
    navigate('/teacher/dashboard')
  }

  function onSave(e: FormEvent) {
    e.preventDefault()
    const test = buildTest(isPublished)
    if (test.questions.length === 0) return
    upsertTest(test)
    setSavedSnapshot(currentSnapshot)
    setSaveStatus('Saved — ready to publish.')
    setPublishReminder('')
    if (embedded) {
      navigate(`/teacher/dashboard/tests/${test.id}`, { replace: true })
    } else {
      navigate(`/teacher/tests/${test.id}`, { replace: true })
    }
  }

  function onPublish() {
    if (!isSaved) {
      setSaveStatus('')
      setPublishReminder('Save this test first. Publish will light up when it is ready.')
      return
    }

    const test = buildTest(true, existing?.code ?? makeCode())
    if (test.questions.length === 0) return
    upsertTest(test)
    setIsPublished(true)
    setPublishReminder('')

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
        emailOnSubmit: test.emailOnSubmit ?? false,
        code: test.code,
        createdAt: test.createdAt,
      },
      teacherEmail: teacher!.email,
      teacherName: teacher!.name,
    }
    const data = encodePayload(payload)
    const url = absoluteJoinUrl(test.code, data)
    setShareUrl(url)
    setShareRevealCount((count) => count + 1)
  }

  async function copyLink() {
    if (!shareUrl) return
    await navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className={embedded ? 'tdash-editor' : 'page'}>
      {embedded ? null : (
        <>
          <Link className="back" to="/teacher/dashboard">
            ← Dashboard
          </Link>
          <h1>{existing ? 'Edit test' : 'New test'}</h1>
        </>
      )}

      <section className="ai-builder-launch">
        <div>
          <strong>Create with AI</strong>
        </div>
        <button
          type="button"
          className={showAiBuilder ? 'btn ghost' : 'btn primary'}
          onClick={() => {
            setShowAiBuilder((show) => !show)
            setAiError('')
          }}
        >
          {showAiBuilder ? 'Close' : 'Build with AI'}
        </button>
      </section>

      {aiStatus && <p className="status-ok ai-import-status">✓ {aiStatus}</p>}

      {showAiBuilder && (
        <section className="ai-builder">
          <div className="ai-builder-head">
            <div>
              <p className="eyebrow">AI import</p>
              <h2>Prompt &amp; paste</h2>
            </div>
          </div>

          <div className="ai-builder-grid">
            <div className="ai-step">
              <div className="ai-step-title">
                <span>1</span>
                <div>
                  <h3>Prompt</h3>
                </div>
              </div>

              <div className="ai-quick-fields">
                <label>
                  Year
                  <input
                    value={aiSettings.yearLevel}
                    onChange={(e) => updateAiSetting('yearLevel', e.target.value)}
                    inputMode="numeric"
                  />
                </label>
                <label className="ai-topic-field">
                  Subject or topic
                  <input
                    value={aiSettings.topic}
                    onChange={(e) => updateAiSetting('topic', e.target.value)}
                    placeholder="e.g. Multiplication"
                  />
                </label>
                <label>
                  Questions
                  <input
                    value={aiSettings.questionCount}
                    onChange={(e) => updateAiSetting('questionCount', e.target.value)}
                    inputMode="numeric"
                  />
                </label>
                <label>
                  Difficulty
                  <select
                    value={aiSettings.difficulty}
                    onChange={(e) => updateAiSetting('difficulty', e.target.value)}
                  >
                    <option>Easy</option>
                    <option>Moderate</option>
                    <option>Challenging</option>
                    <option>Mixed</option>
                  </select>
                </label>
              </div>

              <label className="ai-prompt-field">
                AI prompt
                <textarea rows={11} value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} />
              </label>
              <button type="button" className="btn primary" onClick={() => void copyAiPrompt()}>
                {aiCopied ? '✓ Prompt copied' : 'Copy prompt'}
              </button>
            </div>

            <div className="ai-step">
              <div className="ai-step-title">
                <span>2</span>
                <div>
                  <h3>AI response</h3>
                </div>
              </div>
              <label className="ai-response-field">
                Paste response
                <textarea
                  rows={18}
                  value={aiResponse}
                  onChange={(e) => setAiResponse(e.target.value)}
                  placeholder="Paste JSON here…"
                />
              </label>
              <button
                type="button"
                className="btn primary"
                disabled={!aiResponse.trim()}
                onClick={importAiResponse}
              >
                Import test
              </button>
            </div>
          </div>

          {aiError && <p className="error ai-builder-error">{aiError}</p>}
        </section>
      )}

      <form className="stack" onSubmit={onSave}>
        <section className="test-details-panel">
          <div className="test-details-head test-details-head-inline">
            <input
              className="test-title-input"
              aria-label="Test name"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onFocus={() => {
                if (title === 'Test name') setTitle('')
              }}
              placeholder="Test name"
            />
            <span className="test-question-count">
              {questions.length} {questions.length === 1 ? 'question' : 'questions'}
            </span>
          </div>

          <label className="check">
            <input
              type="checkbox"
              checked={!allowTyping}
              onChange={(e) => setAllowTyping(!e.target.checked)}
            />
            Draw mode only - no typing
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={emailOnSubmit}
              onChange={(e) => setEmailOnSubmit(e.target.checked)}
            />
            Student submission email
          </label>
        </section>

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
              value={q.prompt}
              onChange={(e) =>
                setQuestions((all) =>
                  all.map((x) => (x.id === q.id ? { ...x, prompt: e.target.value } : x)),
                )
              }
            />
            <label className="answer-field">
              Answer
              <textarea
                rows={2}
                value={q.answer ?? ''}
                onChange={(e) =>
                  setQuestions((all) =>
                    all.map((x) => (x.id === q.id ? { ...x, answer: e.target.value } : x)),
                  )
                }
              />
            </label>

            <div className="locked-source-edit">
              {q.lockedSource ? (
                <div className="locked-source-preview">
                  <img src={q.lockedSource.dataUrl} alt={q.lockedSource.name || 'Attached source'} />
                  <div className="row gap wrap">
                    <span className="muted">{q.lockedSource.name || 'Attached'}</span>
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
                <div className="tdash-source-actions">
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
                    title="Upload image or PDF"
                    aria-label="Upload image or PDF"
                    onClick={() => fileInputRefs.current[q.id]?.click()}
                  >
                    {sourceBusyId === q.id ? '…' : 'Upload'}
                  </button>
                  <button
                    type="button"
                    className="btn ghost"
                    disabled={sourceBusyId === q.id}
                    title="Paste image"
                    aria-label="Paste image"
                    onClick={() => void pasteSource(q.id)}
                  >
                    Paste
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}

        {sourceError && <p className="error">{sourceError}</p>}

        <div className="tdash-q-footer tdash-form-footer">
          <div className="tdash-add-wrap">
            <button
              type="button"
              className="tdash-add-question"
              aria-label="Add a question"
              title="Add a question"
              onClick={() => {
                const next = blankQuestion()
                setQuestions((all) => [...all, next])
                setFocusQuestionId(next.id)
              }}
            >
              +
            </button>
            <span className="tdash-add-hint" aria-hidden="true">
              Add a question
            </span>
          </div>
          <div className="tdash-editor-actions-main">
            <button
              className={`btn primary${publishReminder ? ' save-reminder' : ''}`}
              type="submit"
            >
              Save
            </button>
            <button
              className={`btn ${isSaved ? 'primary publish-ready' : 'ghost publish-waiting'}`}
              type="button"
              onClick={onPublish}
              aria-describedby={publishReminder ? 'publish-reminder' : undefined}
            >
              Publish
            </button>
            {existing && (
              <button
                className="btn danger"
                type="button"
                onClick={() => {
                  deleteTest(existing.id)
                  goDashboard()
                }}
              >
                Delete
              </button>
            )}
          </div>
        </div>

        {isSaved && saveStatus && <p className="publish-status">✓ {saveStatus}</p>}
        {publishReminder && (
          <p className="publish-reminder" id="publish-reminder" role="alert">
            {publishReminder}
          </p>
        )}
      </form>

      {(shareUrl || isPublished) && (
        <section
          key={`share-${shareRevealCount}`}
          ref={shareBoxRef}
          className={`share-box share-box-inline${shareRevealCount > 0 ? ' share-box-revealed' : ''}`}
        >
          <span className="share-box-check" aria-hidden="true">
            ✓
          </span>
          <span className="share-box-label">Published</span>
          <span className="share-box-code">
            Code{' '}
            <strong>{existing?.code ?? shareUrl.match(/join\/([^?]+)/)?.[1]}</strong>
          </span>
          {shareUrl ? (
            <button
              ref={copyLinkRef}
              type="button"
              className="btn primary"
              onClick={copyLink}
            >
              {copied ? 'Copied' : 'Copy link'}
            </button>
          ) : (
            <button type="button" className="btn ghost" onClick={onPublish}>
              Refresh link
            </button>
          )}
        </section>
      )}
    </div>
  )
}
