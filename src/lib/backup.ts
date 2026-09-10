import { downloadBlob } from './pdf'
import {
  getSubmissions,
  getTeacher,
  getTests,
  saveTeacher,
  saveTests,
  writeSubmissions,
} from './storage'
import type { Submission, TeacherProfile, Test } from '../types'

export type TeacherBackup = {
  v: 1
  kind: 'testpro-teacher-backup' | 'mathtester-teacher-backup'
  exportedAt: string
  teacher: TeacherProfile
  tests: Test[]
  submissions: Submission[]
}

export function buildTeacherBackup(): TeacherBackup | null {
  const teacher = getTeacher()
  if (!teacher) return null
  return {
    v: 1,
    kind: 'testpro-teacher-backup',
    exportedAt: new Date().toISOString(),
    teacher,
    tests: getTests(),
    submissions: getSubmissions(),
  }
}

export function downloadTeacherBackup() {
  const backup = buildTeacherBackup()
  if (!backup) throw new Error('No teacher profile to back up.')
  const stamp = backup.exportedAt.slice(0, 10)
  const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' })
  downloadBlob(blob, `testpro-backup-${stamp}.json`)
  return backup
}

function isBackup(data: unknown): data is TeacherBackup {
  if (!data || typeof data !== 'object') return false
  const b = data as TeacherBackup
  return (
    b.v === 1 &&
    (b.kind === 'testpro-teacher-backup' || b.kind === 'mathtester-teacher-backup') &&
    Array.isArray(b.tests) &&
    Array.isArray(b.submissions)
  )
}

function mergeById<T extends { id: string }>(local: T[], incoming: T[]): T[] {
  const map = new Map(local.map((item) => [item.id, item]))
  for (const item of incoming) {
    map.set(item.id, item)
  }
  return Array.from(map.values())
}

/** Merge backup into this browser. Keeps local items not in the file; overwrites shared ids from the file. */
export async function restoreTeacherBackupFromFile(file: File): Promise<{
  tests: number
  submissions: number
}> {
  const text = await file.text()
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('That file is not valid JSON.')
  }
  if (!isBackup(data)) {
    throw new Error('Not a TestPro teacher backup file.')
  }

  if (data.teacher?.email && data.teacher?.pin) {
    saveTeacher(data.teacher)
  }

  const tests = mergeById(getTests(), data.tests)
  const submissions = mergeById(getSubmissions(), data.submissions)
  saveTests(tests)
  writeSubmissions(submissions)

  return { tests: data.tests.length, submissions: data.submissions.length }
}

export function downloadSubmissionFile(sub: Submission) {
  const payload = {
    v: 1 as const,
    kind: 'submission' as const,
    submission: sub,
  }
  const safe = sub.studentName.replace(/[^\w\- ]+/g, '').replace(/\s+/g, '_') || 'student'
  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' })
  downloadBlob(blob, `submission-${safe}-${sub.testCode}.json`)
}

export async function importSubmissionFromFile(file: File): Promise<Submission> {
  const text = await file.text()
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('That file is not valid JSON.')
  }
  const obj = data as { kind?: string; submission?: Submission; v?: number }
  if (obj?.kind === 'submission' && obj.submission?.pages) {
    return obj.submission
  }
  // Bare submission object
  if ((data as Submission)?.pages && (data as Submission)?.studentName) {
    return data as Submission
  }
  throw new Error('Not a submission JSON file.')
}
