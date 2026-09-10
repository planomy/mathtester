import type { StudentAttempt, Submission, TeacherProfile, Test } from '../types'

const KEYS = {
  teacher: 'mathtester-teacher',
  tests: 'mathtester-tests',
  submissions: 'mathtester-submissions',
  attempt: 'mathtester-attempt',
  session: 'mathtester-session',
} as const

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function write<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value))
}

export function getTeacher(): TeacherProfile | null {
  return read<TeacherProfile | null>(KEYS.teacher, null)
}

export function saveTeacher(profile: TeacherProfile) {
  write(KEYS.teacher, profile)
}

export function clearTeacherSession() {
  localStorage.removeItem(KEYS.session)
}

export function setTeacherSession(ok: boolean) {
  write(KEYS.session, { ok, at: Date.now() })
}

export function hasTeacherSession(): boolean {
  const s = read<{ ok?: boolean } | null>(KEYS.session, null)
  return Boolean(s?.ok)
}

export function getTests(): Test[] {
  return read<Test[]>(KEYS.tests, [])
}

export function saveTests(tests: Test[]) {
  write(KEYS.tests, tests)
}

export function upsertTest(test: Test) {
  const tests = getTests()
  const i = tests.findIndex((t) => t.id === test.id)
  if (i >= 0) tests[i] = test
  else tests.unshift(test)
  saveTests(tests)
}

export function deleteTest(id: string) {
  saveTests(getTests().filter((t) => t.id !== id))
}

export function getTestByCode(code: string): Test | undefined {
  const normalized = code.trim().toUpperCase()
  return getTests().find((t) => t.code === normalized && t.published)
}

export function getSubmissions(): Submission[] {
  return read<Submission[]>(KEYS.submissions, [])
}

export function addSubmission(sub: Submission) {
  const all = getSubmissions()
  const normalized: Submission = {
    ...sub,
    markPages: sub.markPages ?? sub.pages.map(() => ({ strokes: [], texts: [] })),
    status: sub.status ?? 'received',
  }
  const i = all.findIndex((s) => s.id === normalized.id)
  if (i >= 0) all[i] = normalized
  else all.unshift(normalized)
  write(KEYS.submissions, all)
}

export function upsertSubmission(sub: Submission) {
  addSubmission(sub)
}

export function writeSubmissions(subs: Submission[]) {
  write(KEYS.submissions, subs)
}

export function getAttempt(): StudentAttempt | null {
  return read<StudentAttempt | null>(KEYS.attempt, null)
}

export function saveAttempt(attempt: StudentAttempt) {
  write(KEYS.attempt, attempt)
}

export function clearAttempt() {
  localStorage.removeItem(KEYS.attempt)
}

export function uid(prefix = 'id'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`
}

export function makeCode(length = 6): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let out = ''
  for (let i = 0; i < length; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return out
}
