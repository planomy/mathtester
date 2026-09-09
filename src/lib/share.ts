import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'
import type { Submission, Test } from '../types'

export type SharedTestPayload = {
  v: 1
  kind: 'test'
  test: Pick<Test, 'id' | 'title' | 'questions' | 'allowTyping' | 'code' | 'createdAt'>
  teacherEmail: string
  teacherName: string
}

export type SharedSubmissionPayload = {
  v: 1
  kind: 'submission'
  submission: Submission
}

export function encodePayload(data: SharedTestPayload | SharedSubmissionPayload): string {
  return compressToEncodedURIComponent(JSON.stringify(data))
}

export function decodePayload(raw: string): SharedTestPayload | SharedSubmissionPayload | null {
  try {
    const json = decompressFromEncodedURIComponent(raw)
    if (!json) return null
    const data = JSON.parse(json) as SharedTestPayload | SharedSubmissionPayload
    if (data?.v !== 1) return null
    return data
  } catch {
    return null
  }
}

export function absoluteJoinUrl(code: string, data: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '')
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  return `${origin}${base}/#/join/${encodeURIComponent(code)}?d=${data}`
}
