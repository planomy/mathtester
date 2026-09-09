import { type FormEvent, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import {
  getTeacher,
  hasTeacherSession,
  saveTeacher,
  setTeacherSession,
} from '../lib/storage'

export function TeacherGate() {
  const existing = getTeacher()
  const navigate = useNavigate()
  const [mode, setMode] = useState<'login' | 'setup'>(existing ? 'login' : 'setup')
  const [name, setName] = useState(existing?.name ?? '')
  const [email, setEmail] = useState(existing?.email ?? '')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')

  if (hasTeacherSession() && existing) {
    return <Navigate to="/teacher/dashboard" replace />
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (mode === 'setup') {
      if (!name.trim() || !email.trim() || !/^\d{4}$/.test(pin)) {
        setError('Name, email, and a 4-digit PIN are required.')
        return
      }
      saveTeacher({ name: name.trim(), email: email.trim(), pin })
      setTeacherSession(true)
      navigate('/teacher/dashboard')
      return
    }
    if (!existing || pin !== existing.pin) {
      setError('Incorrect PIN.')
      return
    }
    setTeacherSession(true)
    navigate('/teacher/dashboard')
  }

  return (
    <div className="page narrow">
      <Link className="back" to="/">
        ← Home
      </Link>
      <h1>{mode === 'setup' ? 'Set up teacher' : 'Teacher login'}</h1>
      <p className="muted">
        Classroom-simple auth: your email receives student PDFs; a PIN unlocks this device.
      </p>

      <form className="stack" onSubmit={onSubmit}>
        {mode === 'setup' && (
          <>
            <label>
              Your name
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label>
              Email for submissions
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
          </>
        )}
        {mode === 'login' && existing && (
          <p className="chip">{existing.name} · {existing.email}</p>
        )}
        <label>
          4-digit PIN
          <input
            inputMode="numeric"
            pattern="\d{4}"
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
            required
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn primary" type="submit">
          {mode === 'setup' ? 'Create teacher profile' : 'Enter dashboard'}
        </button>
      </form>

      {existing && (
        <button
          type="button"
          className="linkish"
          onClick={() => setMode(mode === 'login' ? 'setup' : 'login')}
        >
          {mode === 'login' ? 'Reset profile on this device' : 'Back to login'}
        </button>
      )}
    </div>
  )
}
