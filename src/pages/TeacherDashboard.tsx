import { useRef, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { downloadTeacherBackup, restoreTeacherBackupFromFile } from '../lib/backup'
import {
  clearTeacherSession,
  deleteTest,
  getSubmissions,
  getTeacher,
  getTests,
  hasTeacherSession,
} from '../lib/storage'

export function TeacherDashboard() {
  const teacher = getTeacher()
  const [tests, setTests] = useState(() => getTests())
  const submissions = getSubmissions()
  const backupInputRef = useRef<HTMLInputElement>(null)
  const [backupMsg, setBackupMsg] = useState('')

  if (!teacher || !hasTeacherSession()) {
    return <Navigate to="/teacher" replace />
  }

  return (
    <div className="page">
      <header className="row-between">
        <div>
          <p className="eyebrow">Teacher</p>
          <h1>{teacher.name}</h1>
          <p className="muted">{teacher.email}</p>
        </div>
        <div className="row gap wrap">
          <Link className="btn ghost" to="/teacher/submissions">
            Submissions ({submissions.length})
          </Link>
          <button
            type="button"
            className="btn ghost"
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
            className="btn ghost"
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

      {backupMsg && <p className="status-ok">{backupMsg}</p>}

      <p className="muted">
        Tests and student submissions live in this browser until you download a backup.
        Restore that file on another device or after clearing site data.
      </p>

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
            <li key={t.id} className="test-list-item">
              <Link to={`/teacher/tests/${t.id}`}>
                <strong>{t.title}</strong>
                <span>
                  {t.questions.length} Q · {t.published ? `Code ${t.code}` : 'Draft'}
                  {t.allowTyping ? '' : ' · typing off'}
                </span>
              </Link>
              <button
                type="button"
                className="test-delete-button"
                aria-label={`Delete ${t.title}`}
                title="Delete test"
                onClick={() => {
                  if (!window.confirm(`Delete “${t.title}”? This cannot be undone.`)) return
                  deleteTest(t.id)
                  setTests((all) => all.filter((test) => test.id !== t.id))
                  setBackupMsg(`Deleted “${t.title}”.`)
                }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
