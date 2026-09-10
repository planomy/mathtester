import { type FormEvent, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { decodePayload } from '../lib/share'
import { saveActiveTest } from '../lib/session'
import { getTestByCode, saveAttempt } from '../lib/storage'
import type { PageInk, Test } from '../types'

const emptyPage = (): PageInk => ({ strokes: [], texts: [] })

export function StudentJoin() {
  const { code: routeCode } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const embedded = useMemo(() => {
    const d = params.get('d')
    if (!d) return null
    const payload = decodePayload(d)
    if (payload?.kind === 'test') return payload
    return null
  }, [params])

  const [code, setCode] = useState(routeCode?.toUpperCase() ?? '')
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  function resolveTest(): { test: Test; teacherEmail: string; teacherName: string } | null {
    if (embedded) {
      const t = embedded.test
      return {
        test: {
          ...t,
          updatedAt: t.createdAt,
          published: true,
        },
        teacherEmail: embedded.teacherEmail,
        teacherName: embedded.teacherName,
      }
    }
    const local = getTestByCode(code)
    if (!local) return null
    return {
      test: local,
      teacherEmail: '',
      teacherName: '',
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!name.trim()) {
      setError('Enter your name.')
      return
    }
    const resolved = resolveTest()
    if (!resolved || resolved.test.questions.length === 0) {
      setError(
        'Test not found. Open the full teacher link, or join on the same device where it was published.',
      )
      return
    }

    const { test, teacherEmail, teacherName } = resolved
    saveActiveTest({ test, teacherEmail, teacherName })
    saveAttempt({
      testId: test.id,
      testCode: test.code,
      studentName: name.trim(),
      pages: test.questions.map(() => emptyPage()),
      startedAt: new Date().toISOString(),
    })
    navigate(`/sit/${test.code}`)
  }

  return (
    <div className="page narrow">
      <Link className="back" to="/">
        ← Home
      </Link>
      <h1>Join test</h1>
      <p className="muted">Enter the code from your teacher, or open their shared link.</p>

      {embedded && (
        <p className="chip">
          Linked test: {embedded.test.title} ({embedded.test.code})
        </p>
      )}

      <form className="stack" onSubmit={onSubmit}>
        {!embedded && (
          <label>
            Test code
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. K7M2PQ"
              required
            />
          </label>
        )}
        <label>
          Your name
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn primary" type="submit">
          Start
        </button>
      </form>
    </div>
  )
}
