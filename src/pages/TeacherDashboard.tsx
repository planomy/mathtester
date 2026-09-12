import { useRef, useState } from 'react'
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom'
import { downloadTeacherBackup, restoreTeacherBackupFromFile } from '../lib/backup'
import {
  clearTeacherSession,
  deleteTest,
  getSubmissions,
  getTeacher,
  getTests,
  hasTeacherSession,
} from '../lib/storage'

function TestsPanel() {
  const [tests, setTests] = useState(() => getTests())
  const [msg, setMsg] = useState('')

  return (
    <>
      {msg && <p className="status-ok tdash-status">{msg}</p>}
      {tests.length === 0 ? (
        <div className="tdash-empty">
          <div className="tdash-empty-mark" aria-hidden="true" />
          <h3>Add your first questions</h3>
          <p>
            Start a test, drop in prompts (and locked graphs if you need them), then publish for
            the class.
          </p>
          <Link className="btn primary" to="/teacher/dashboard/new">
            Create a test
          </Link>
        </div>
      ) : (
        <ul className="tdash-list">
          {tests.map((t) => (
            <li key={t.id} className="tdash-list-item">
              <Link to={`/teacher/dashboard/tests/${t.id}`}>
                <strong>{t.title}</strong>
                <span>
                  {t.questions.length} Q · {t.published ? `Code ${t.code}` : 'Draft'}
                  {t.allowTyping ? '' : ' · typing off'}
                </span>
              </Link>
              <button
                type="button"
                className="tdash-delete"
                aria-label={`Delete ${t.title}`}
                title="Delete test"
                onClick={() => {
                  if (!window.confirm(`Delete “${t.title}”? This cannot be undone.`)) return
                  deleteTest(t.id)
                  setTests((all) => all.filter((test) => test.id !== t.id))
                  setMsg(`Deleted “${t.title}”.`)
                }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

export function TeacherDashboard() {
  const teacher = getTeacher()
  const location = useLocation()
  const tests = getTests()
  const submissions = getSubmissions()
  const backupInputRef = useRef<HTMLInputElement>(null)
  const [backupMsg, setBackupMsg] = useState('')

  if (!teacher || !hasTeacherSession()) {
    return <Navigate to="/teacher" replace />
  }

  const published = tests.filter((t) => t.published).length
  const editing =
    location.pathname.includes('/dashboard/new') ||
    location.pathname.includes('/dashboard/tests/')

  return (
    <div className="tdash">
      <aside className="tdash-dock" aria-label="Teacher tools">
        <div className="tdash-identity">
          <p className="tdash-eyebrow">Teacher</p>
          <h1 className="tdash-name">{teacher.name}</h1>
          <p className="tdash-email">{teacher.email}</p>
        </div>

        <nav className="tdash-nav" aria-label="Teacher sections">
          <Link
            className={`tdash-nav-item${!location.pathname.includes('/submissions') ? ' is-active' : ''}`}
            to="/teacher/dashboard"
            aria-current={!location.pathname.includes('/submissions') ? 'page' : undefined}
          >
            <span>Tests</span>
            <span className="tdash-nav-count">{tests.length}</span>
          </Link>
          <Link className="tdash-nav-item" to="/teacher/submissions">
            <span>Submissions</span>
            <span className="tdash-nav-count">{submissions.length}</span>
          </Link>
        </nav>

        <div className="tdash-dock-actions">
          <button
            type="button"
            className="tdash-quiet"
            onClick={() => {
              try {
                downloadTeacherBackup()
                setBackupMsg('Backup downloaded — keep it somewhere safe.')
              } catch (err) {
                setBackupMsg(err instanceof Error ? err.message : 'Backup failed.')
              }
            }}
          >
            Save backup
          </button>
          <button
            type="button"
            className="tdash-quiet"
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
              if (!file) return
              void restoreTeacherBackupFromFile(file)
                .then((r) => {
                  setBackupMsg(
                    `Restored ${r.submissions} submission(s) and ${r.tests} test(s).`,
                  )
                  window.location.reload()
                })
                .catch((err) => {
                  setBackupMsg(err instanceof Error ? err.message : 'Restore failed.')
                })
            }}
          />
          <button
            type="button"
            className="tdash-quiet tdash-quiet-danger"
            onClick={() => {
              clearTeacherSession()
              window.location.hash = '#/teacher'
            }}
          >
            Lock
          </button>
        </div>
      </aside>

      <main className="tdash-main">
        <header className="tdash-main-head">
          <div>
            <p className="tdash-eyebrow">Workspace</p>
            <h2>Your tests</h2>
            <p className="tdash-lede">
              Build questions here, publish a student link, then mark submissions.
            </p>
          </div>
          <Link className="btn primary tdash-new" to="/teacher/dashboard/new">
            New test
          </Link>
        </header>

        <div className="tdash-stats" aria-label="Overview">
          <div className="tdash-stat">
            <strong>{tests.length}</strong>
            <span>Tests</span>
          </div>
          <div className="tdash-stat">
            <strong>{published}</strong>
            <span>Published</span>
          </div>
          <div className="tdash-stat">
            <strong>{submissions.length}</strong>
            <span>Submissions</span>
          </div>
        </div>

        {backupMsg && <p className="status-ok tdash-status">{backupMsg}</p>}

        <section
          className={`tdash-panel${editing ? ' tdash-panel-editing' : ''}`}
          aria-label={editing ? 'Test editor' : 'Tests'}
        >
          <Outlet />
        </section>
      </main>
    </div>
  )
}

export function DashboardTestsPanel() {
  return <TestsPanel />
}
