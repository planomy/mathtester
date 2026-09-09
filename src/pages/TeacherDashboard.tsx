import { Link, Navigate } from 'react-router-dom'
import {
  clearTeacherSession,
  getSubmissions,
  getTeacher,
  getTests,
  hasTeacherSession,
} from '../lib/storage'

export function TeacherDashboard() {
  const teacher = getTeacher()
  if (!teacher || !hasTeacherSession()) {
    return <Navigate to="/teacher" replace />
  }

  const tests = getTests()
  const submissions = getSubmissions()

  return (
    <div className="page">
      <header className="row-between">
        <div>
          <p className="eyebrow">Teacher</p>
          <h1>{teacher.name}</h1>
          <p className="muted">{teacher.email}</p>
        </div>
        <div className="row gap">
          <Link className="btn ghost" to="/teacher/submissions">
            Submissions ({submissions.length})
          </Link>
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              clearTeacherSession()
              window.location.hash = '#/teacher'
            }}
          >
            Lock
          </button>
        </div>
      </header>

      <div className="row-between section-head">
        <h2>Tests</h2>
        <Link className="btn primary" to="/teacher/tests/new">
          New test
        </Link>
      </div>

      {tests.length === 0 ? (
        <p className="empty">No tests yet. Add questions, publish, and share a student link.</p>
      ) : (
        <ul className="list">
          {tests.map((t) => (
            <li key={t.id}>
              <Link to={`/teacher/tests/${t.id}`}>
                <strong>{t.title}</strong>
                <span>
                  {t.questions.length} Q · {t.published ? `Code ${t.code}` : 'Draft'}
                  {t.allowTyping ? '' : ' · typing off'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
