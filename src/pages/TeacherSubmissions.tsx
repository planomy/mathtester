import { type FormEvent, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { decodePayload } from '../lib/share'
import {
  addSubmission,
  getSubmissions,
  getTeacher,
  hasTeacherSession,
} from '../lib/storage'
import type { PageInk } from '../types'
import { renderPageToCanvas } from '../lib/pdf'

export function TeacherSubmissions() {
  const teacher = getTeacher()
  if (!teacher || !hasTeacherSession()) {
    return <Navigate to="/teacher" replace />
  }

  const [subs, setSubs] = useState(() => getSubmissions())
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const [activeId, setActiveId] = useState<string | null>(null)

  const active = subs.find((s) => s.id === activeId) ?? null

  function onImport(e: FormEvent) {
    e.preventDefault()
    setError('')
    const payload = decodePayload(token.trim())
    if (!payload || payload.kind !== 'submission') {
      setError('Not a valid submission token.')
      return
    }
    addSubmission(payload.submission)
    setSubs(getSubmissions())
    setActiveId(payload.submission.id)
    setToken('')
  }

  return (
    <div className="page">
      <Link className="back" to="/teacher/dashboard">
        ← Dashboard
      </Link>
      <h1>Submissions</h1>
      <p className="muted">
        PDFs arrive by email. Paste a student import token here to review working in-app.
      </p>

      <form className="stack" onSubmit={onImport}>
        <label>
          Import token
          <textarea
            rows={3}
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

      <ul className="list">
        {subs.map((s) => (
          <li key={s.id}>
            <button type="button" className="list-btn" onClick={() => setActiveId(s.id)}>
              <strong>
                {s.studentName} · {s.testTitle}
              </strong>
              <span>
                {s.testCode} · {new Date(s.submittedAt).toLocaleString()}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {active && (
        <section className="review">
          <h2>
            {active.studentName} — {active.testTitle}
          </h2>
          <div className="review-pages">
            {active.pages.map((page: PageInk, i: number) => {
              const canvas = renderPageToCanvas(page, active.questionPrompts[i] || '', {
                studentName: active.studentName,
                testTitle: active.testTitle,
                index: i,
                total: active.pages.length,
              })
              return (
                <img
                  key={`${active.id}-${i}`}
                  className="review-img"
                  src={canvas.toDataURL('image/jpeg', 0.75)}
                  alt={`Question ${i + 1}`}
                />
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
